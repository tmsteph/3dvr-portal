import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createOpenClawHandler, openClawSshCommand } from '../src/openclaw/handler.js';
import { verifySignedSeaPayload } from '../src/auth/sea.js';
const { default: SEA } = await import('gun/sea.js');

async function call(handler, body, origin = 'https://portal.3dvr.tech') {
  const res = { headers: {}, setHeader(key, value) { this.headers[key] = value; }, end(value) { this.body = JSON.parse(value); } };
  await handler({ method: 'POST', headers: { origin }, body }, res);
  return res;
}

async function setup(t) {
  const state = await mkdtemp(join(tmpdir(), 'helm-test-'));
  t.after(() => rm(state, { recursive: true, force: true }));
  const pair = await SEA.pair();
  const config = { THREEDVR_OPERATOR_OWNER_BINDINGS: JSON.stringify({ 'tmsteph@3dvr': pair.pub }), THREEDVR_HELM_STATE_DIR: state };
  const sign = async (overrides = {}, signingPair = pair) => {
    const body = { action: 'chat', requestId: 'request-123456789', sessionId: 'session-123456789', message: 'Hello', ...overrides };
    return { ...body, authPub: signingPair.pub, authProof: await SEA.sign({ ...body, scope: 'openclaw-helm', pub: signingPair.pub, iat: Date.now(), origin: 'https://portal.3dvr.tech' }, signingPair) };
  };
  return { config, sign, pair };
}

test('owner proofs bind action, message, session, origin and request id', async t => {
  const { config, sign } = await setup(t);
  let runs = 0;
  const handler = createOpenClawHandler({ config, verify: verifySignedSeaPayload, run: async () => { runs++; return { ok: true, reply: 'hello' }; } });
  const original = await sign();
  for (const altered of [{ message: 'do something else' }, { action: 'status' }, { requestId: 'request-987654321' }, { sessionId: 'session-987654321' }]) {
    assert.equal((await call(handler, { ...original, ...altered })).statusCode, 403);
  }
  assert.equal((await call(handler, original, 'https://evil.example')).statusCode, 403);
  assert.equal((await call(handler, await sign({}, await SEA.pair()))).statusCode, 403);
  assert.equal((await call(handler, { ...original, authProof: '' })).statusCode, 401);
  assert.equal(runs, 0);
  assert.equal((await call(handler, original)).statusCode, 200);
  assert.equal(runs, 1);
});

test('durable receipt prevents a repeat agent run across handler restarts', async t => {
  const { config, sign } = await setup(t);
  let runs = 0;
  const run = async () => { runs++; return { ok: true, reply: 'done' }; };
  const body = await sign();
  assert.equal((await call(createOpenClawHandler({ config, run }), body)).statusCode, 200);
  const restarted = createOpenClawHandler({ config, run });
  assert.equal((await call(restarted, body)).body.reply, 'done');
  assert.equal(runs, 1);
  assert.equal((await call(restarted, await sign({ message: 'changed' }))).statusCode, 409);
});

test('transport uncertainty cannot replay the message', async t => {
  const { config, sign } = await setup(t);
  let runs = 0;
  const run = async () => { runs++; throw new Error('ssh lost'); };
  const body = await sign();
  assert.equal((await call(createOpenClawHandler({ config, run }), body)).statusCode, 503);
  assert.equal((await call(createOpenClawHandler({ config, run }), body)).statusCode, 409);
  assert.equal(runs, 1);
});

test('concurrent chat is bounded while status stays available', async t => {
  const { config, sign } = await setup(t);
  let finish;
  let started;
  const began = new Promise(resolve => { started = resolve; });
  const handler = createOpenClawHandler({ config, run: request => request.action === 'status'
    ? { ok: true, gateway: 'reachable' }
    : new Promise(resolve => { finish = resolve; started(); }) });
  const first = call(handler, await sign());
  await began;
  assert.equal((await call(handler, await sign({ requestId: 'second-123456789' }))).statusCode, 429);
  assert.equal((await call(handler, await sign({ action: 'status' }))).statusCode, 200);
  finish({ ok: true, reply: 'done' });
  await first;
});


test('only tmsteph account key can chat or check status, even with other Portal grants', async t => {
  const { config, sign } = await setup(t);
  const other = await SEA.pair();
  config.THREEDVR_OPERATOR_OWNER_PUBS = other.pub;
  config.THREEDVR_OPERATOR_ADMIN_PUBS = other.pub;
  config.THREEDVR_OPERATOR_DEVELOPER_PUBS = other.pub;
  let runs = 0;
  const handler = createOpenClawHandler({ config, run: async () => { runs++; return { ok: true }; } });
  for (const action of ['status', 'chat']) {
    const impostor = await sign({ action, alias: 'tmsteph@3dvr' }, other);
    assert.equal((await call(handler, impostor)).statusCode, 403);
    assert.equal((await call(handler, await sign({ action }))).statusCode, 200);
  }
  assert.equal(runs, 2);
});


test('root service drops to the existing mesh user; non-root keeps its own identity', () => {
  assert.deepEqual(openClawSshCommand({}, 0), { command: '/usr/sbin/runuser', prefix: ['-u', 'debian', '--', 'ssh'] });
  assert.deepEqual(openClawSshCommand({}, 1000), { command: 'ssh', prefix: [] });
  assert.throws(() => openClawSshCommand({ THREEDVR_OPENCLAW_SSH_USER: '-bad' }, 0));
});

test('verified owner is distinguished from a failed agent transport', async t => {
  const { config, sign } = await setup(t);
  const handler = createOpenClawHandler({ config, run: async () => { throw new Error('ssh unavailable'); } });
  const response = await call(handler, await sign({ action: 'status' }));
  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.body.identity, { verified: true, username: 'tmsteph', alias: 'tmsteph@3dvr' });
  assert.equal((await call(handler, await sign({ action: 'status' }, await SEA.pair()))).body.identity, undefined);
});

test('server rejects stale or tampered queue expiry before invoking the agent', async t => {
  const { config, sign } = await setup(t);
  const now = Date.now();
  let runs = 0;
  const handler = createOpenClawHandler({ config, now: () => now,
    run: async () => { runs++; return { ok: true, reply: 'Done' }; } });
  const expired = await sign({ createdAt: now - 600001, expiresAt: now - 1 });
  const result = await call(handler, expired);
  assert.equal(result.statusCode, 410);
  assert.equal(result.body.stale, true);
  assert.equal(runs, 0);
  assert.equal((await call(handler, { ...expired, expiresAt: now + 600000 })).statusCode, 403);
  const stripped = { ...expired }; delete stripped.createdAt; delete stripped.expiresAt;
  assert.equal((await call(handler, stripped)).statusCode, 403);
  assert.equal((await call(handler, await sign({ createdAt: now, expiresAt: now + 600001 }))).statusCode, 400);
  assert.equal((await call(handler, await sign({ createdAt: now, expiresAt: now + 600000 }))).statusCode, 200);
  assert.equal(runs, 1);
});

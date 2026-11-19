import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createOpenClawHandler } from '../src/openclaw/handler.js';
import { verifySignedSeaPayload } from '../src/auth/sea.js';
const { default: SEA } = await import('gun/sea.js');

async function call(handler, body, origin = 'https://portal.3dvr.tech') {
  const res = { headers: {}, setHeader(key, value) { this.headers[key] = value; }, end(value) { this.body = JSON.parse(value); } };
  await handler({ method: 'POST', headers: { origin }, body }, res);
  return res;
}

async function setup(t, configOverrides = {}) {
  const state = await mkdtemp(join(tmpdir(), 'helm-core-test-'));
  t.after(() => rm(state, { recursive: true, force: true }));
  const pair = await SEA.pair();
  const config = { THREEDVR_OPERATOR_OWNER_BINDINGS: JSON.stringify({ 'tmsteph@3dvr': pair.pub }), THREEDVR_HELM_STATE_DIR: state, ...configOverrides };
  const sign = async (overrides = {}) => {
    const body = { action: 'chat', requestId: 'request-123456789', sessionId: 'session-123456789', message: 'Hello', engine: 'core', ...overrides };
    return { ...body, authPub: pair.pub, authProof: await SEA.sign({ ...body, scope: 'openclaw-helm', pub: pair.pub, iat: Date.now(), origin: 'https://portal.3dvr.tech' }, pair) };
  };
  return { config, sign };
}

function fakeEngines() {
  const calls = { coreRun: [], coreStatus: 0, bridge: 0 };
  const core = {
    run: async request => { calls.coreRun.push(request); return { ok: true, reply: 'core reply', engine: '3DVR Core', session: request.session }; },
    status: async () => { calls.coreStatus++; return { ok: true, engine: '3DVR Core', model: 'deepseek-ai/DeepSeek-V4.1-Flash-1017' }; },
  };
  const run = async () => { calls.bridge++; return { ok: true, reply: 'bridge reply' }; };
  return { calls, core, run };
}

test('core engine chat runs in-process and never touches the SSH bridges', async t => {
  const { config, sign } = await setup(t);
  const { calls, core, run } = fakeEngines();
  const handler = createOpenClawHandler({ config, verify: verifySignedSeaPayload, run, core });
  const res = await call(handler, await sign());
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.reply, 'core reply');
  assert.equal(calls.coreRun.length, 1);
  assert.equal(calls.coreRun[0].engine, 'core');
  assert.match(calls.coreRun[0].session, /^helm-[a-f0-9]{24}-session-123456789$/);
  assert.equal(calls.bridge, 0);
});

test('core engine status checks the core, not a bridge', async t => {
  const { config, sign } = await setup(t);
  const { calls, core, run } = fakeEngines();
  const handler = createOpenClawHandler({ config, verify: verifySignedSeaPayload, run, core });
  const res = await call(handler, await sign({ action: 'status' }));
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.model, 'deepseek-ai/DeepSeek-V4.1-Flash-1017');
  assert.equal(res.body.identity.username, 'tmsteph');
  assert.equal(calls.coreStatus, 1);
  assert.equal(calls.bridge, 0);
});

test('core failures reach the user with their reason', async t => {
  const { config, sign } = await setup(t);
  const { run } = fakeEngines();
  const core = {
    run: async () => ({ ok: false, error: '3DVR Core could not resolve its DeepInfra key from the secrets broker: denied' }),
    status: async () => ({ ok: false, error: '3DVR Core is unavailable: denied' }),
  };
  const handler = createOpenClawHandler({ config, verify: verifySignedSeaPayload, run, core });
  const res = await call(handler, await sign());
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.ok, false);
  assert.match(res.body.error, /secrets broker: denied/);
});

test('core engine also completes through the durable queue when it is enabled', async t => {
  const { config, sign } = await setup(t, { HELM_QUEUE: '1' });
  const { calls, core, run } = fakeEngines();
  const handler = createOpenClawHandler({ config, verify: verifySignedSeaPayload, run, core });
  const now = Date.now();
  const res = await call(handler, await sign({ createdAt: now, expiresAt: now + 10 * 60 * 1000 }));
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.reply, 'core reply');
  assert.equal(calls.coreRun.length, 1);
  assert.equal(calls.bridge, 0);
});

test('an unknown engine is still rejected', async t => {
  const { config, sign } = await setup(t);
  const { core, run } = fakeEngines();
  const handler = createOpenClawHandler({ config, verify: verifySignedSeaPayload, run, core });
  const res = await call(handler, await sign({ engine: 'bogus' }));
  assert.equal(res.statusCode, 400);
});

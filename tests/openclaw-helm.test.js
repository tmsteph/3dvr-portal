import test from 'node:test';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createOpenClawHandler, openClawSshCommand, runOpenClaw } from '../src/openclaw/handler.js';
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

function streamCall(handler, body) {
  const chunks = [];
  const res = { headers: {}, setHeader(key, value) { this.headers[key] = value; },
    flushHeaders() {}, write(value) { chunks.push(value); }, end(value) {
      if (value) chunks.push(value); this.finished = true;
    } };
  const done = handler({ method: 'POST', headers: { origin: 'https://portal.3dvr.tech', accept: 'text/event-stream' }, body }, res);
  return { res, chunks, done };
}

test('SSE exposes fragments before completion, and replay uses the durable final receipt', async t => {
  const { config, sign } = await setup(t);
  let release, started;
  const ready = new Promise(resolve => { started = resolve; });
  let calls = 0;
  const run = async (_request, { onDelta }) => {
    calls++;
    onDelta('Early');
    started();
    await new Promise(resolve => { release = resolve; });
    return { ok: true, reply: 'Early and final' };
  };
  const body = await sign();
  const stream = streamCall(createOpenClawHandler({ config, run }), body);
  await ready;
  assert.equal(stream.res.headers['Content-Type'], 'text/event-stream; charset=utf-8');
  assert.ok(stream.chunks.some(chunk => chunk.includes('"text":"Early"')));
  assert.equal(stream.res.finished, undefined);
  assert.equal((await call(createOpenClawHandler({ config, run }), body)).statusCode, 409);
  release(); await stream.done;
  assert.ok(stream.chunks.some(chunk => chunk.includes('event: result') && chunk.includes('"ok":true')));
  const replay = streamCall(createOpenClawHandler({ config, run }), body);
  await replay.done;
  assert.ok(replay.chunks.some(chunk => chunk.includes('Early and final')));
  assert.equal(calls, 1);
});

test('partial stream failure remains uncertain and never reruns after handler restart', async t => {
  const { config, sign } = await setup(t);
  let runs = 0;
  const run = async (_request, { onDelta }) => { runs++; onDelta('Partial'); throw new Error('lost SSH'); };
  const body = await sign();
  const stream = streamCall(createOpenClawHandler({ config, run }), body);
  await stream.done;
  assert.ok(stream.chunks.some(chunk => chunk.includes('"ok":false')));
  assert.equal((await call(createOpenClawHandler({ config, run }), body)).statusCode, 409);
  assert.equal(runs, 1);
});

test('stream negotiation cannot bypass owner authorization', async t => {
  const { config, sign } = await setup(t);
  let runs = 0;
  const run = async () => { runs++; return { ok: true, reply: 'Denied' }; };
  const stream = streamCall(createOpenClawHandler({ config, run }), await sign({}, await SEA.pair()));
  await stream.done;
  assert.equal(stream.res.statusCode, 403);
  assert.equal(stream.res.headers['Content-Type'], 'application/json; charset=utf-8');
  assert.equal(runs, 0);
});

test('SSH JSONL decoder handles fragmented UTF-8 and requires an authoritative final result', async () => {
  const makeChild = () => Object.assign(new EventEmitter(), {
    stdout: new PassThrough(), stderr: new PassThrough(), stdin: new PassThrough(),
    kill() { this.emit('close', 1); }
  });
  const child = makeChild();
  const deltas = [];
  const task = runOpenClaw({ action: 'chat', message: 'Hello' }, { uid: 1000, spawn: () => child,
    onDelta: text => deltas.push(text) });
  await new Promise(resolve => child.stdin.once('data', resolve));
  const text = Buffer.from('{"type":"delta","text":"Hi 🌍"}\n{"ok":true,"reply":"Hi 🌍"}\n');
  for (const byte of text) child.stdout.write(Buffer.from([byte]));
  child.emit('close', 0);
  assert.equal((await task).reply, 'Hi 🌍');
  assert.deepEqual(deltas, ['Hi 🌍']);

  const interrupted = makeChild();
  const failed = runOpenClaw({ action: 'chat', message: 'Hello' }, { uid: 1000,
    spawn: () => interrupted, onDelta: () => {} });
  await new Promise(resolve => interrupted.stdin.once('data', resolve));
  interrupted.stdout.write('{"type":"delta","text":"Partial"}\n');
  interrupted.emit('close', 0);
  await assert.rejects(failed, /transport/);
});

test('engine selection is signed; legacy proofs stay OpenClaw and receipts cannot cross engines', async t => {
  const { config, sign } = await setup(t);
  const requests = [];
  const handler = createOpenClawHandler({ config, run: async request => {
    requests.push(request); return { ok: true, reply: 'Done' };
  } });
  const legacy = await sign();
  assert.equal((await call(handler, { ...legacy, engine: 'codex' })).statusCode, 403);
  const native = await sign({ engine: 'codex' });
  const stripped = { ...native }; delete stripped.engine;
  assert.equal((await call(handler, stripped)).statusCode, 403);
  assert.equal((await call(handler, await sign({ engine: 'unknown' }))).statusCode, 400);
  assert.equal(requests.length, 0);
  assert.equal((await call(handler, native)).statusCode, 200);
  assert.equal(requests[0].engine, 'codex');
  assert.match(requests[0].session, /^helm-[a-f0-9]{24}-session-/);
  assert.equal((await call(handler, legacy)).statusCode, 409);
  assert.equal(requests.length, 1);
  assert.equal((await call(handler, await sign({ requestId: 'legacy-123456789' }))).statusCode, 200);
  assert.equal(requests[1].engine, undefined);
});

test('native status and chat retain the same owner boundary and cannot choose backend thread IDs', async t => {
  const { config, sign } = await setup(t);
  const requests = [];
  const handler = createOpenClawHandler({ config, run: async request => {
    requests.push(request); return { ok: true, reply: 'Done' };
  } });
  for (const action of ['status', 'chat']) {
    assert.equal((await call(handler, await sign({ action, engine: 'codex' }, await SEA.pair()))).statusCode, 403);
  }
  assert.equal(requests.length, 0);
  assert.equal((await call(handler, await sign({ engine: 'codex', threadId: 'foreign-thread' }))).statusCode, 200);
  assert.equal(requests[0].threadId, undefined);
});

test('native SSH transport uses only the native script and binds engine in encoded request', async () => {
  const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), stdin: new PassThrough(), kill() {} });
  let args;
  const task = runOpenClaw({ action: 'chat', engine: 'codex', message: 'Hi' }, { uid: 1000,
    spawn: (_command, values) => { args = values; return child; } });
  const script = await new Promise(resolve => child.stdin.once('data', chunk => resolve(chunk.toString())));
  assert.ok(script.includes('class Client:'));
  assert.equal(script.includes('gateway.get('), false);
  assert.equal(JSON.parse(Buffer.from(args.at(-1), 'base64url')).engine, 'codex');
  child.stdout.write('{"ok":true,"reply":"Done"}\n'); child.emit('close', 0);
  assert.equal((await task).reply, 'Done');
});

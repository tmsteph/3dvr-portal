import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createOpenClawHandler, helmConcurrency, helmQueueEnabled } from '../src/openclaw/handler.js';
import { verifySignedSeaPayload } from '../src/auth/sea.js';
const { default: SEA } = await import('gun/sea.js');

async function call(handler, body, origin = 'https://portal.3dvr.tech') {
  const res = { headers: {}, setHeader(key, value) { this.headers[key] = value; }, end(value) { this.body = JSON.parse(value); } };
  await handler({ method: 'POST', headers: { origin }, body }, res);
  return res;
}

async function setup(t, configOverrides = {}) {
  const state = await mkdtemp(join(tmpdir(), 'helm-queue-test-'));
  t.after(() => rm(state, { recursive: true, force: true }));
  const pair = await SEA.pair();
  const config = { THREEDVR_OPERATOR_OWNER_BINDINGS: JSON.stringify({ 'tmsteph@3dvr': pair.pub }),
    THREEDVR_HELM_STATE_DIR: state, HELM_QUEUE: '1', ...configOverrides };
  const sign = async (overrides = {}, { envelope = true } = {}) => {
    const now = Date.now();
    const body = { action: 'chat', requestId: 'request-123456789', sessionId: 'session-123456789',
      message: 'Hello', createdAt: now, expiresAt: now + 600000, ...overrides };
    if (!envelope) { delete body.createdAt; delete body.expiresAt; }
    return { ...body, authPub: pair.pub,
      authProof: await SEA.sign({ ...body, scope: 'openclaw-helm', pub: pair.pub, iat: Date.now(), origin: 'https://portal.3dvr.tech' }, pair) };
  };
  // The real client contract: resubmit the same signed request until the
  // receipt resolves to a terminal answer instead of a 202.
  const pollUntilDone = async (handler, body, tries = 200) => {
    let response;
    for (let i = 0; i < tries; i++) {
      response = await call(handler, body);
      if (response.statusCode !== 202) return response;
      await tick();
    }
    return response;
  };
  return { config, sign, state, pollUntilDone };
}

const deferred = () => {
  let resolve;
  const promise = new Promise(value => { resolve = value; });
  return { promise, resolve };
};
const tick = () => new Promise(resolve => setImmediate(resolve));
const waitFor = async (condition, tries = 500) => {
  for (let i = 0; i < tries; i++) { if (condition()) return; await tick(); }
  throw new Error('waitFor timed out');
};
const settle = () => new Promise(resolve => setTimeout(resolve, 60));

test('HELM_QUEUE defaults off and HELM_CONCURRENCY defaults to 1', () => {
  assert.equal(helmQueueEnabled({}), false);
  assert.equal(helmQueueEnabled({ HELM_QUEUE: '0' }), false);
  assert.equal(helmQueueEnabled({ HELM_QUEUE: 'off' }), false);
  assert.equal(helmQueueEnabled({ HELM_QUEUE: '1' }), true);
  assert.equal(helmQueueEnabled({ HELM_QUEUE: ' on ' }), true);
  assert.equal(helmConcurrency({}), 1);
  assert.equal(helmConcurrency({ HELM_CONCURRENCY: '2' }), 2);
  assert.equal(helmConcurrency({ HELM_CONCURRENCY: '99' }), 4);
  assert.equal(helmConcurrency({ HELM_CONCURRENCY: 'x' }), 1);
});

test('flag off keeps the execute-or-429 behavior exactly', async t => {
  const { config, sign } = await setup(t, { HELM_QUEUE: '0' });
  const gate = deferred();
  let started;
  const began = new Promise(resolve => { started = resolve; });
  const handler = createOpenClawHandler({ config, verify: verifySignedSeaPayload,
    run: async () => { started(); await gate.promise; return { ok: true, reply: 'done' }; } });
  const first = call(handler, await sign());
  await began;
  assert.equal((await call(handler, await sign({ requestId: 'second-123456789' }))).statusCode, 429);
  gate.resolve();
  assert.equal((await first).statusCode, 200);
});

test('queued submissions absorb a burst: 202 with positions, zero 429, all complete', async t => {
  const { config, sign, pollUntilDone } = await setup(t);
  const gate = deferred();
  let runs = 0;
  const handler = createOpenClawHandler({ config, verify: verifySignedSeaPayload,
    run: async request => { runs++; await gate.promise; return { ok: true, reply: `reply-${request.session}` }; } });
  const bodies = [];
  for (let i = 0; i < 4; i++) {
    bodies.push(await sign({ requestId: `burst-req-000${i}`, sessionId: `burst-sess-00${i}` }));
  }
  const first = call(handler, bodies[0]);
  await waitFor(() => runs === 1);
  const queuedResponses = [];
  for (let i = 1; i < 4; i++) queuedResponses.push(await call(handler, bodies[i]));
  for (const [index, response] of queuedResponses.entries()) {
    assert.equal(response.statusCode, 202);
    assert.equal(response.body.queued, true);
    assert.equal(response.body.position, index + 1);
  }
  // Polling a queued record is a safe replay: still 202, never a rerun.
  assert.equal((await call(handler, bodies[1])).statusCode, 202);
  gate.resolve();
  const firstDone = await first;
  assert.equal(firstDone.statusCode, 200);
  assert.ok(firstDone.body.reply.startsWith('reply-helm-'));
  assert.ok(firstDone.body.reply.endsWith('burst-sess-000'));
  for (let i = 1; i < 4; i++) {
    const done = await pollUntilDone(handler, bodies[i]);
    assert.equal(done.statusCode, 200);
    assert.equal(done.body.ok, true);
  }
  assert.equal(runs, 4);
  await settle();
});

test('per-session FIFO: one lane never overlaps itself and order is submission order', async t => {
  const { config, sign } = await setup(t);
  const gate = deferred();
  const order = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const handler = createOpenClawHandler({ config, verify: verifySignedSeaPayload,
    run: async request => {
      inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
      order.push(request.message);
      await gate.promise;
      inFlight--;
      return { ok: true, reply: request.message };
    } });
  const one = await sign({ requestId: 'fifo-req-00001', message: 'turn-one' });
  const two = await sign({ requestId: 'fifo-req-00002', message: 'turn-two' });
  const three = await sign({ requestId: 'fifo-req-00003', message: 'turn-three' });
  const first = call(handler, one);
  await tick();
  assert.equal((await call(handler, two)).statusCode, 202);
  assert.equal((await call(handler, three)).statusCode, 202);
  gate.resolve();
  await first;
  assert.equal((await call(handler, two)).body.reply, 'turn-two');
  assert.equal((await call(handler, three)).body.reply, 'turn-three');
  assert.deepEqual(order, ['turn-one', 'turn-two', 'turn-three']);
  assert.equal(maxInFlight, 1);
});

test('fairness: round-robin by oldest head keeps one lane from monopolizing', async t => {
  const { config, sign } = await setup(t);
  const gate = deferred();
  const order = [];
  const handler = createOpenClawHandler({ config, verify: verifySignedSeaPayload,
    run: async request => { order.push(request.message); await gate.promise; return { ok: true, reply: request.message }; } });
  const mk = (session, id, message) => sign({ sessionId: session, requestId: id, message });
  const a1 = await mk('fair-sess-aaa1', 'fair-req-a001', 'a1');
  const a2 = await mk('fair-sess-aaa1', 'fair-req-a002', 'a2');
  const b1 = await mk('fair-sess-bbb1', 'fair-req-b001', 'b1');
  const first = call(handler, a1);
  await tick();
  assert.equal((await call(handler, a2)).statusCode, 202);
  assert.equal((await call(handler, b1)).statusCode, 202);
  gate.resolve();
  await first;
  await call(handler, a2);
  await call(handler, b1);
  // a2 was submitted before b1, but b1 is the head of its own lane, and
  // a2 must wait behind its lane's a1 anyway; dispatch order a1, then
  // the oldest waiting head: a2 (seq 2) before b1 (seq 3). The fairness
  // property that matters: b1 is never starved behind a long lane; it
  // dispatches as soon as the single slot frees after a2, and crucially
  // neither ever saw a 429.
  assert.deepEqual(order, ['a1', 'a2', 'b1']);
});

test('pool isolation: a character chat completes while a gateway turn runs', async t => {
  const { config, sign } = await setup(t);
  const gate = deferred();
  let gatewayStarted;
  const began = new Promise(resolve => { gatewayStarted = resolve; });
  const handler = createOpenClawHandler({ config, verify: verifySignedSeaPayload,
    run: async () => { gatewayStarted(); await gate.promise; return { ok: true, reply: 'gateway' }; },
    runCharacterChat: async () => ({ ok: true, reply: 'character' }) });
  const gatewayTurn = call(handler, await sign({ requestId: 'pool-req-gw001' }));
  await began;
  const character = await call(handler, await sign({ requestId: 'pool-req-ch001', characterId: 'kayla' }));
  assert.equal(character.statusCode, 200);
  assert.equal(character.body.reply, 'character');
  gate.resolve();
  assert.equal((await gatewayTurn).body.reply, 'gateway');
});

test('pool isolation: a Codex turn no longer blocks a Helm gateway chat', async t => {
  const { config, sign } = await setup(t);
  const gate = deferred();
  let codexStarted;
  const began = new Promise(resolve => { codexStarted = resolve; });
  const handler = createOpenClawHandler({ config, verify: verifySignedSeaPayload,
    run: async request => {
      if (request.engine === 'codex') { codexStarted(); await gate.promise; return { ok: true, reply: 'codex' }; }
      return { ok: true, reply: 'gateway' };
    } });
  const codexTurn = call(handler, await sign({ requestId: 'pool-req-cx001', engine: 'codex' }));
  await began;
  const chat = await call(handler, await sign({ requestId: 'pool-req-gw002' }));
  assert.equal(chat.statusCode, 200);
  assert.equal(chat.body.reply, 'gateway');
  gate.resolve();
  await codexTurn;
});

test('non-envelope callers hold instead of receiving a 202 they cannot poll', async t => {
  const { config, sign } = await setup(t);
  const gate = deferred();
  const handler = createOpenClawHandler({ config, verify: verifySignedSeaPayload,
    run: async request => { await gate.promise; return { ok: true, reply: `ok-${request.message}` }; },
    runCharacterChat: async () => { await gate.promise; return { ok: true, reply: 'character-done' }; } });
  const first = call(handler, await sign({ requestId: 'hold-req-00001', message: 'first' }));
  await tick();
  // Character-page callers sign no queue envelope; their proof covers a
  // body without createdAt/expiresAt, exactly as signed here.
  const heldBody = await sign({ requestId: 'hold-req-00002', characterId: 'kayla', message: 'character turn' }, { envelope: false });
  const held = call(handler, heldBody);
  let heldSettled = false;
  void held.then(() => { heldSettled = true; });
  await tick(); await tick();
  assert.equal(heldSettled, false);
  gate.resolve();
  assert.equal((await first).statusCode, 200);
  const heldResult = await held;
  assert.equal(heldResult.statusCode, 200);
  assert.equal(heldResult.body.reply, 'character-done');
});

test('a message that expires while queued becomes a stale receipt, never a send', async t => {
  const { config, sign } = await setup(t);
  const gate = deferred();
  const handler = createOpenClawHandler({ config, verify: verifySignedSeaPayload,
    run: async request => { await gate.promise; return { ok: true, reply: `ok-${request.message}` }; } });
  const first = call(handler, await sign({ requestId: 'stale-req-0001', message: 'blocker' }));
  await tick();
  const now = Date.now();
  const short = await sign({ requestId: 'stale-req-0002', message: 'short-lived', createdAt: now, expiresAt: now + 1200 });
  assert.equal((await call(handler, short)).statusCode, 202);
  await new Promise(resolve => setTimeout(resolve, 1300));
  const polled = await call(handler, short);
  assert.equal(polled.statusCode, 410);
  assert.equal(polled.body.stale, true);
  gate.resolve();
  await first;
  // And it stays stale: a later poll never executes it.
  assert.equal((await call(handler, short)).statusCode, 410);
});

test('restart recovery: queued records resume, running records go uncertain, nothing duplicates', async t => {
  const { config, sign, pollUntilDone } = await setup(t);
  const gate = deferred();
  let runsFirst = 0;
  let runsSecond = 0;
  // The first handler stands in for the process that "dies": its runs
  // block on a gate that only opens at the very end of the test, so
  // everything the second handler does happens while the first is
  // genuinely stuck, the way a dead process is stuck forever.
  const runFirst = async request => { runsFirst++; await gate.promise; return { ok: true, reply: `ok-${request.message}` }; };
  const runSecond = async request => { runsSecond++; return { ok: true, reply: `ok-${request.message}` }; };
  const first = createOpenClawHandler({ config, verify: verifySignedSeaPayload, run: runFirst });
  const running = await sign({ requestId: 'restart-req-001', message: 'was-running' });
  const queuedBody = await sign({ requestId: 'restart-req-002', message: 'was-queued' });
  const runningCall = call(first, running);
  await waitFor(() => runsFirst === 1);
  assert.equal((await call(first, queuedBody)).statusCode, 202);
  // Simulate a portal restart: a brand-new handler over the same state dir.
  const second = createOpenClawHandler({ config, verify: verifySignedSeaPayload, run: runSecond });
  const uncertain = await call(second, running);
  assert.equal(uncertain.statusCode, 409);
  const done = await pollUntilDone(second, queuedBody);
  assert.equal(done.statusCode, 200);
  assert.equal(done.body.reply, 'ok-was-queued');
  assert.equal(runsSecond, 1); // the queued record executed exactly once, on the new handler
  assert.equal(runsFirst, 1);  // and the interrupted record never reran anywhere
  gate.resolve();
  await runningCall;
  await settle();
});

test('queue-full is the only remaining 429 and it is per-lane', async t => {
  const { config, sign } = await setup(t);
  const gate = deferred();
  const handler = createOpenClawHandler({ config, verify: verifySignedSeaPayload,
    run: async () => { await gate.promise; return { ok: true, reply: 'ok' }; } });
  const first = call(handler, await sign({ requestId: 'full-req-00000', sessionId: 'full-sess-0001' }));
  await tick();
  for (let i = 1; i < 20; i++) {
    const response = await call(handler, await sign({ requestId: `full-req-000${String(i).padStart(2, '0')}`, sessionId: 'full-sess-0001' }));
    assert.equal(response.statusCode, 202, `submission ${i}`);
  }
  const overflow = await call(handler, await sign({ requestId: 'full-req-00100', sessionId: 'full-sess-0001' }));
  assert.equal(overflow.statusCode, 429);
  // A different lane is unaffected by the full lane.
  const other = await call(handler, await sign({ requestId: 'full-req-00200', sessionId: 'full-sess-0002' }));
  assert.equal(other.statusCode, 202);
  gate.resolve();
  await first;
  await settle();
});

test('HELM_CONCURRENCY=2 lets two sessions run at once, never two turns of one session', async t => {
  const { config, sign } = await setup(t, { HELM_CONCURRENCY: '2' });
  const gate = deferred();
  let inFlight = 0;
  let maxInFlight = 0;
  const perSession = new Map();
  const perSessionMax = new Map();
  const handler = createOpenClawHandler({ config, verify: verifySignedSeaPayload,
    run: async request => {
      inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
      const current = (perSession.get(request.session) || 0) + 1;
      perSession.set(request.session, current);
      perSessionMax.set(request.session, Math.max(perSessionMax.get(request.session) || 0, current));
      await gate.promise;
      perSession.set(request.session, current - 1);
      inFlight--;
      return { ok: true, reply: 'ok' };
    } });
  const a = call(handler, await sign({ requestId: 'conc-req-a0001', sessionId: 'conc-sess-a001' }));
  const b = call(handler, await sign({ requestId: 'conc-req-b0001', sessionId: 'conc-sess-b001' }));
  const a2 = call(handler, await sign({ requestId: 'conc-req-a0002', sessionId: 'conc-sess-a001' }));
  await waitFor(() => maxInFlight === 2);
  gate.resolve();
  await Promise.all([a, b, a2]);
  await settle();
  assert.equal(maxInFlight, 2);
  for (const max of perSessionMax.values()) assert.equal(max, 1);
});

test('queued gateway runs carry the queued marker and the long transport budget', async t => {
  const { config, sign } = await setup(t);
  const seen = [];
  const handler = createOpenClawHandler({ config, verify: verifySignedSeaPayload,
    run: async (request, runOptions) => { seen.push({ request, runOptions }); return { ok: true, reply: 'ok' }; } });
  assert.equal((await call(handler, await sign())).statusCode, 200);
  assert.equal(seen[0].request.queued, true);
  assert.equal(seen[0].runOptions.timeoutMs, 220000);
});

test('a running turn publishes a rolling preview on its receipt until the result replaces it', async t => {
  const { config, sign, state } = await setup(t);
  const gate = deferred();
  let emit;
  const began = new Promise(resolve => { emit = resolve; });
  const handler = createOpenClawHandler({ config, verify: verifySignedSeaPayload,
    run: async (_request, runOptions) => {
      // Preview capture is wired for every queued turn, not only for a
      // submitter holding its connection open.
      assert.equal(typeof runOptions.onDelta, 'function');
      assert.equal(typeof runOptions.onActivity, 'function');
      runOptions.onActivity('Running a command');
      runOptions.onDelta('Hello ');
      runOptions.onDelta('world');
      emit();
      await gate.promise;
      return { ok: true, reply: 'Hello world' };
    } });
  const body = await sign({ requestId: 'preview-req-001' });
  const held = call(handler, body);
  await began;
  // A poll while the turn runs answers 202 with the live preview.
  const poll = await call(handler, body);
  assert.equal(poll.statusCode, 202);
  assert.equal(poll.body.preview.text, 'Hello world');
  assert.equal(poll.body.preview.activity, 'Running a command');
  assert.equal(typeof poll.body.preview.startedAt, 'number');
  // The preview is durable: within the persist throttle it reaches the
  // receipt file itself, so it survives the process, not just polls.
  const receiptPath = async () => join(state, (await readdir(state)).find(name => name.endsWith('.json')));
  const readReceipt = async () => JSON.parse(await readFile(await receiptPath(), 'utf8'));
  let receipt;
  for (let i = 0; i < 80; i++) {
    receipt = await readReceipt();
    if (receipt.previewText === 'Hello world') break;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.equal(receipt.status, 'running');
  assert.equal(receipt.previewText, 'Hello world');
  assert.equal(receipt.previewActivity, 'Running a command');
  assert.equal(typeof receipt.startedAt, 'number');
  gate.resolve();
  const done = await held;
  assert.equal(done.statusCode, 200);
  assert.equal(done.body.reply, 'Hello world');
  assert.equal(done.body.preview, undefined);
  // Terminal persist clears the preview from the receipt.
  const after = await readReceipt();
  assert.equal(after.status, 'completed');
  assert.equal(after.previewText, undefined);
  assert.equal(after.previewActivity, undefined);
});

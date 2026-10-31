import test from 'node:test';
import assert from 'node:assert/strict';
import { createOutbox, MESSAGE_TTL_MS } from '../helm/outbox.js';

function setup() {
  let clock = 1000000;
  let ready = false;
  const saved = new Map();
  const sent = [];
  const box = createOutbox({ now: () => clock, isReady: () => ready,
    save: async record => saved.set(record.id, structuredClone(record)),
    send: async record => { sent.push(record); return { reply: 'Done' }; } });
  return { box, saved, sent, advance: ms => { clock += ms; }, ready: () => { ready = true; } };
}
const first = { id: 'message-12345678', sessionId: 'session-12345678', text: 'First' };

test('accepts while disconnected then dispatches in order with stable ids', async () => {
  const f = setup();
  await f.box.enqueue(first);
  await f.box.enqueue({ ...first, id: 'message-23456789', text: 'Second' });
  await f.box.drain();
  assert.equal(f.sent.length, 0);
  assert.equal(f.saved.get(first.id).status, 'queued');
  f.ready();
  await f.box.drain();
  assert.deepEqual(f.sent.map(record => record.text), ['First', 'Second']);
  assert.equal(f.sent[0].id, first.id);
  assert.equal(f.box.snapshot()[0].reply, 'Done');
});

test('stale messages survive in history and never send after a reload', async () => {
  const f = setup();
  const record = await f.box.enqueue(first);
  f.advance(MESSAGE_TTL_MS);
  f.ready();
  await f.box.drain();
  assert.equal(f.sent.length, 0);
  assert.equal(f.box.snapshot()[0].status, 'stale');
  f.box.merge(record);
  assert.equal(f.box.snapshot()[0].status, 'stale', 'late queued snapshot cannot resurrect expired work');
});

test('restored sending record is never replayed; concurrent drains only dispatch once', async () => {
  const f = setup();
  const record = await f.box.enqueue(first);
  f.box.merge({ ...record, status: 'sending', updatedAt: record.updatedAt + 1 });
  f.ready();
  await f.box.drain();
  assert.equal(f.sent.length, 0);
  const another = setup();
  await another.box.enqueue(first);
  another.ready();
  await Promise.all([another.box.drain(), another.box.drain()]);
  assert.equal(another.sent.length, 1);
});

test('unknown delivery becomes history and a late queued snapshot cannot replay it', async () => {
  const states = [];
  const box = createOutbox({ isReady: () => true, save: async record => states.push(record),
    send: async () => { throw new Error('Timed out'); } });
  const record = await box.enqueue(first);
  await box.drain();
  assert.deepEqual(states.map(record => record.status), ['queued', 'sending', 'uncertain']);
  box.merge(record);
  await box.drain();
  assert.equal(states.length, 3);
});

test('cancelled messages stay in history and storage failure never dispatches', async () => {
  const f = setup();
  await f.box.enqueue(first);
  await f.box.cancel(first.id);
  f.ready();
  await f.box.drain();
  assert.equal(f.sent.length, 0);
  assert.equal(f.box.snapshot()[0].status, 'cancelled');
  const box = createOutbox({ isReady: () => true, save: async () => { throw new Error('Storage full'); }, send: async () => assert.fail() });
  await assert.rejects(box.enqueue(first), /Storage full/);
  assert.equal(box.snapshot().length, 0);
});

test('busy rejection survives reload and retries with the original id', async () => {
  const states = [];
  let attempts = 0;
  const send = async record => {
    assert.equal(record.id, first.id);
    if (++attempts === 1) throw Object.assign(new Error('Busy'), { retryable: true });
    return { reply: 'Done' };
  };
  const make = () => createOutbox({ now: () => 1000000, isReady: () => true,
    save: async record => states.push(record), send });
  const box = make();
  await box.enqueue(first);
  await box.drain();
  assert.equal(box.snapshot()[0].status, 'deferred');
  const restored = make();
  for (const state of [...states].reverse()) restored.merge(state);
  assert.equal(restored.snapshot()[0].status, 'deferred');
  await restored.drain();
  assert.equal(attempts, 2);
  assert.equal(restored.snapshot()[0].status, 'completed');
});

test('busy messages can expire or be cancelled without retrying', async () => {
  let clock = 1000000;
  const box = createOutbox({ now: () => clock, isReady: () => true, save: async () => {},
    send: async () => { throw Object.assign(new Error('Busy'), { retryable: true }); } });
  await box.enqueue(first);
  await box.drain();
  await box.cancel(first.id);
  assert.equal(box.snapshot()[0].status, 'cancelled');
  await box.enqueue({ ...first, id: 'message-23456789' });
  await box.drain();
  clock += MESSAGE_TTL_MS;
  await box.drain();
  assert.equal(box.snapshot()[1].status, 'stale');
});

test('switching engines never retargets queued records, including legacy records', async () => {
  let engine = 'openclaw';
  const sent = [];
  const queue = createOutbox({ save: async () => {}, send: async record => {
    sent.push(record); return { reply: 'Done' };
  }, isReady: () => true, canSend: record => (record.engine ?? 'openclaw') === engine });
  await queue.enqueue({ id: 'native-message-123', sessionId: 'native-session-123', engine: 'codex', text: 'Native only' });
  await queue.enqueue({ id: 'claw-message-12345', sessionId: 'claw-session-12345', text: 'Existing route' });
  await queue.drain();
  assert.deepEqual(sent.map(record => record.engine), ['openclaw']);
  assert.equal(queue.snapshot().find(record => record.engine === 'codex').status, 'queued');
  engine = 'codex'; await queue.drain();
  assert.deepEqual(sent.map(record => record.engine), ['openclaw', 'codex']);
});

test('backup queue preserves its engine and cannot drain primary messages', async () => {
  let engine = 'codex-backup';
  const sent = [];
  const box = createOutbox({ save: async () => {}, now: () => 1000000, isReady: () => true,
    canSend: record => record.engine === engine,
    send: async record => { sent.push(record.engine); return { reply: 'Done' }; } });
  await box.enqueue({ id: 'backup-message-123', sessionId: 'backup-session-123', text: 'backup', engine: 'codex-backup' });
  await box.enqueue({ id: 'primary-message-123', sessionId: 'primary-session-123', text: 'primary', engine: 'codex' });
  await box.drain();
  assert.deepEqual(sent, ['codex-backup']);
  assert.equal(box.snapshot().find(record => record.engine === 'codex').status, 'queued');
  engine = 'codex';
  await box.drain();
  assert.deepEqual(sent, ['codex-backup', 'codex']);
});

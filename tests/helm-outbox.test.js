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

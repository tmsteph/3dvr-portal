import test from 'node:test';
import assert from 'node:assert/strict';
import { MESSAGE_TTL_MS } from '../helm/outbox.js';
import '../src/auth/sea.js';
const { default: SEA } = await import('gun/sea.js');

test('Gun and local cache store encrypted account records and restore history', async t => {
  const pair = await SEA.pair();
  const originalGun = globalThis.Gun;
  const originalStorage = globalThis.localStorage;
  const map = new Map([['signedIn', 'true'], ['alias', 'tmsteph@3dvr'], ['userPubKey', pair.pub]]);
  const writes = new Map();
  const paths = [];
  let listener;
  const user = { is: { pub: pair.pub, alias: 'tmsteph@3dvr' }, _: { sea: pair }, recall() {}, get(name) { paths.push(name); return node; } };
  const node = { get(name) {
    if (name === 'messages') { paths.push(name); return node; }
    return { put(value, ack) { writes.set(name, value); ack({ ok: 1 }); } };
  }, map() { return { on(fn) { listener = fn; }, off() {} }; } };
  const Gun = () => ({ user: () => user });
  Gun.SEA = SEA;
  globalThis.Gun = Gun;
  globalThis.localStorage = { get length() { return map.size; }, key: index => [...map.keys()][index], getItem: key => map.get(key), setItem: (key, value) => map.set(key, value) };
  t.after(() => { globalThis.Gun = originalGun; globalThis.localStorage = originalStorage; });
  const { openHelmMessageStore } = await import(`../operator/forge.js?helm-store-test=${Date.now()}`);
  const record = { id: 'message-12345678', sessionId: 'session-12345678', text: 'Private queued instruction',
    createdAt: Date.now(), expiresAt: Date.now() + MESSAGE_TTL_MS, updatedAt: Date.now(), status: 'queued' };
  const store = await openHelmMessageStore();
  const otherTab = await openHelmMessageStore();
  await store.save(record);
  assert.deepEqual(paths.slice(0, 2), ['helm-v1', 'messages']);
  const saved = writes.get(`${record.id}:queued`);
  assert.equal(Object.hasOwn(saved, 'text'), false);
  assert.equal(JSON.stringify(saved).includes(record.text), false);
  assert.equal(map.get(`3dvr.helm.encrypted-messages.${pair.pub}:${record.id}:queued`).includes(record.text), false);
  const decoded = await SEA.decrypt(saved.ciphertext, pair);
  assert.deepEqual(typeof decoded === 'string' ? JSON.parse(decoded) : decoded, record);
  const completed = { ...record, status: 'completed', reply: 'Finished' };
  await store.save(completed);
  assert.equal(writes.size, 2, 'completed state cannot be overwritten by a late queued state node');
  const restored = [];
  await openHelmMessageStore({ onRecord: item => restored.push(item) });
  assert.equal(restored.length, 2);
  assert.equal(restored.at(-1).reply, 'Finished');
  await otherTab.save({ ...record, id: 'message-23456789', text: 'Other tab' });
  const bothTabs = [];
  await openHelmMessageStore({ onRecord: item => bothTabs.push(item) });
  assert.equal(bothTabs.length, 3, 'a tab opened before the first save preserves all other tab records');
  user.is.pub = 'different-account';
  await assert.rejects(store.save(record), /Account changed/);
});

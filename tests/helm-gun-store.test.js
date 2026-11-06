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

// A localStorage stand-in with a byte quota, matching the browser behavior that
// broke Helm saves once months of cached encrypted messages filled the origin.
async function openQuotaStore(t) {
  const pair = await SEA.pair();
  const originalGun = globalThis.Gun;
  const originalStorage = globalThis.localStorage;
  const map = new Map([['signedIn', 'true'], ['alias', 'tmsteph@3dvr'], ['userPubKey', pair.pub]]);
  const writes = new Map();
  const user = { is: { pub: pair.pub, alias: 'tmsteph@3dvr' }, _: { sea: pair }, recall() {}, get() { return node; } };
  const node = { get(name) {
    if (name === 'messages') return node;
    return { put(value, ack) { writes.set(name, value); ack({ ok: 1 }); } };
  }, map() { return { on() {}, off() {} }; } };
  const Gun = () => ({ user: () => user });
  Gun.SEA = SEA;
  const storage = {
    quota: Infinity,
    get length() { return map.size; },
    key: index => [...map.keys()][index],
    getItem: key => (map.has(key) ? map.get(key) : null),
    setItem(key, value) {
      const text = String(value);
      let total = key.length + text.length;
      for (const [otherKey, otherValue] of map) {
        if (otherKey !== key) total += otherKey.length + String(otherValue).length;
      }
      if (total > storage.quota) {
        const error = new Error(`Setting the value of '${key}' exceeded the quota.`);
        error.name = 'QuotaExceededError';
        throw error;
      }
      map.set(key, text);
    },
    removeItem: key => map.delete(key)
  };
  globalThis.Gun = Gun;
  globalThis.localStorage = storage;
  t.after(() => { globalThis.Gun = originalGun; globalThis.localStorage = originalStorage; });
  const { openHelmMessageStore } = await import(`../operator/forge.js?helm-quota-test=${Date.now()}-${Math.random()}`);
  const store = await openHelmMessageStore();
  const prefix = `3dvr.helm.encrypted-messages.${pair.pub}:`;
  const seed = (id, status, updatedAt, size = 100) => {
    map.set(`${prefix}${id}:${status}`, JSON.stringify({ ciphertext: 'x'.repeat(size), updatedAt }));
  };
  const usage = () => [...map].reduce((sum, [key, value]) => sum + key.length + String(value).length, 0);
  const record = (id, text = 'Fresh instruction') => ({
    id, sessionId: 'session-12345678', text,
    createdAt: Date.now(), expiresAt: Date.now() + MESSAGE_TTL_MS, updatedAt: Date.now(), status: 'queued'
  });
  return { pair, map, storage, store, prefix, seed, usage, record };
}

test('a quota failure evicts the oldest cached history entry and retries the save', async t => {
  const { map, storage, store, prefix, seed, usage, record } = await openQuotaStore(t);
  seed('message-old0001', 'completed', 1000, 800);
  seed('message-new0002', 'completed', 2000, 100);
  storage.quota = usage() + 50;
  const fresh = record('message-fresh01');
  assert.equal(await store.save(fresh), true);
  assert.equal(map.has(`${prefix}message-old0001:completed`), false, 'oldest history entry is evicted');
  assert.equal(map.has(`${prefix}message-new0002:completed`), true, 'newer history entry is kept');
  assert.equal(map.has(`${prefix}${fresh.id}:queued`), true, 'the new entry lands after eviction');
});

test('a quota failure evicts history before queued outbox entries, even older ones', async t => {
  const { map, storage, store, prefix, seed, usage, record } = await openQuotaStore(t);
  seed('message-queue01', 'queued', 500, 100);
  seed('message-hist001', 'completed', 1000, 800);
  seed('message-hist002', 'completed', 1500, 100);
  storage.quota = usage() + 50;
  const fresh = record('message-fresh02');
  assert.equal(await store.save(fresh), true);
  assert.equal(map.has(`${prefix}message-queue01:queued`), true, 'queued outbox entry survives');
  assert.equal(map.has(`${prefix}message-hist001:completed`), false, 'oldest history entry is evicted first');
  assert.equal(map.has(`${prefix}message-hist002:completed`), true, 'one eviction frees enough room');
  assert.equal(map.has(`${prefix}${fresh.id}:queued`), true, 'the new entry lands after eviction');
});

test('the entry being written is never evicted and the quota error surfaces when nothing else can go', async t => {
  const { map, storage, store, prefix, record } = await openQuotaStore(t);
  const original = record('message-keep001', 'Original text');
  assert.equal(await store.save(original), true);
  const key = `${prefix}${original.id}:queued`;
  const savedValue = map.get(key);
  storage.quota = [...map].reduce((sum, [k, v]) => sum + k.length + String(v).length, 0);
  const bigger = { ...original, text: 'Replacement text that is far too large to fit. '.repeat(40), updatedAt: Date.now() + 1 };
  await assert.rejects(store.save(bigger), /quota/i);
  assert.equal(map.get(key), savedValue, 'the existing entry is left untouched');
});

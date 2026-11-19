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

test('a save succeeds by evicting the legacy cache blob when it holds most of the quota', async t => {
  const { pair, map, storage, store, prefix, usage, record } = await openQuotaStore(t);
  const blobKey = `3dvr.helm.encrypted-messages.${pair.pub}`;
  map.set(blobKey, JSON.stringify({ 'message-legacy1:completed': { ciphertext: 'x'.repeat(2000), updatedAt: 500 } }));
  storage.quota = usage() + 50;
  const fresh = record('message-fresh03');
  assert.equal(await store.save(fresh), true);
  assert.equal(map.has(blobKey), false, 'legacy blob is evicted to make room');
  assert.equal(map.has(`${prefix}${fresh.id}:queued`), true, 'the new entry lands after eviction');
});

test('the legacy blob is evicted only after per-entry history entries', async t => {
  const { pair, map, storage, store, prefix, seed, usage, record } = await openQuotaStore(t);
  const blobKey = `3dvr.helm.encrypted-messages.${pair.pub}`;
  seed('message-hist001', 'completed', 1000, 800);
  map.set(blobKey, 'x'.repeat(1200));
  storage.quota = usage() + 50;
  const fresh = record('message-fresh04');
  assert.equal(await store.save(fresh), true);
  assert.equal(map.has(`${prefix}message-hist001:completed`), false, 'history entry is evicted first');
  assert.equal(map.has(blobKey), true, 'legacy blob survives while history can make room');
  assert.equal(map.has(`${prefix}${fresh.id}:queued`), true, 'the new entry lands after eviction');
});

test('a quota failure evicts the legacy blob before queued outbox entries', async t => {
  const { pair, map, storage, store, prefix, seed, usage, record } = await openQuotaStore(t);
  const blobKey = `3dvr.helm.encrypted-messages.${pair.pub}`;
  seed('message-queue01', 'queued', 500, 100);
  map.set(blobKey, 'x'.repeat(1200));
  storage.quota = usage() + 50;
  const fresh = record('message-fresh05');
  assert.equal(await store.save(fresh), true);
  assert.equal(map.has(blobKey), false, 'legacy blob is evicted');
  assert.equal(map.has(`${prefix}message-queue01:queued`), true, 'queued outbox entry survives');
  assert.equal(map.has(`${prefix}${fresh.id}:queued`), true, 'the new entry lands after eviction');
});

test("another account's legacy blob is never evicted, so the quota error surfaces", async t => {
  const { map, storage, store, prefix, seed, usage, record } = await openQuotaStore(t);
  const otherBlobKey = '3dvr.helm.encrypted-messages.someone-else-pub';
  seed('message-hist001', 'completed', 1000, 100);
  map.set(otherBlobKey, 'x'.repeat(2000));
  storage.quota = usage() + 50;
  await assert.rejects(store.save(record('message-fresh06')), /quota/i);
  assert.equal(map.has(otherBlobKey), true, "another account's blob is untouched");
  assert.equal(map.has(`${prefix}message-hist001:completed`), false, 'own history was evicted while trying');
  assert.equal(map.has(`${prefix}message-fresh06:queued`), false, 'the failed entry never lands');
});

// ---------------------------------------------------------------------------
// IndexedDB cache tests. The store prefers IndexedDB when it can be opened;
// these tests install a minimal in-memory stand-in covering the subset the
// cache uses (open/upgrade, one object store, put/getAll/getAllKeys/delete
// with bound key ranges, transaction completion). State is shared across
// opens so reopening a store sees what earlier opens wrote, like a browser.
// ---------------------------------------------------------------------------

function createFakeIndexedDB() {
  const stores = new Map();
  const clone = value => (value === undefined ? value : JSON.parse(JSON.stringify(value)));
  const control = { failWrites: false, quotaFailures: 0 };
  const IDBKeyRange = { bound: (lower, upper) => ({ lower: String(lower), upper: String(upper) }) };
  const inRange = (key, range) => !range || (key >= range.lower && key <= range.upper);
  const makeDb = () => ({
    createObjectStore(name) { if (!stores.has(name)) stores.set(name, new Map()); return {}; },
    transaction(storeName) {
      const data = stores.get(storeName) || new Map();
      let pending = 0;
      let completed = false;
      const tx = { error: null, oncomplete: null, onerror: null, onabort: null, objectStore: () => storeApi };
      const settle = () => queueMicrotask(() => {
        if (!completed && pending === 0) { completed = true; tx.oncomplete?.(); }
      });
      const request = executor => {
        pending += 1;
        const req = { result: undefined, error: null, onsuccess: null, onerror: null };
        queueMicrotask(() => {
          try { req.result = executor(); req.onsuccess?.({ target: req }); } catch (error) {
            req.error = error; tx.error = error; req.onerror?.({ target: req });
          }
          pending -= 1;
          if (pending === 0) settle();
        });
        return req;
      };
      const storeApi = {
        put(value, key) {
          return request(() => {
            if (control.quotaFailures > 0) {
              control.quotaFailures -= 1;
              const error = new Error('Simulated IndexedDB quota failure.');
              error.name = 'QuotaExceededError';
              throw error;
            }
            if (control.failWrites) {
              const error = new Error('Simulated IndexedDB write failure.');
              error.name = 'UnknownError';
              throw error;
            }
            data.set(String(key), clone(value));
            return key;
          });
        },
        getAll(range) { return request(() => [...data.keys()].filter(key => inRange(key, range)).sort().map(key => clone(data.get(key)))); },
        getAllKeys(range) { return request(() => [...data.keys()].filter(key => inRange(key, range)).sort()); },
        delete(key) { return request(() => { data.delete(String(key)); return undefined; }); }
      };
      return tx;
    },
    close() {}
  });
  const indexedDB = {
    open() {
      const request = { result: null, error: null, onsuccess: null, onerror: null, onupgradeneeded: null, onblocked: null };
      queueMicrotask(() => {
        request.result = makeDb();
        if (!stores.has('messages')) request.onupgradeneeded?.({ target: request });
        request.onsuccess?.({ target: request });
      });
      return request;
    }
  };
  return { indexedDB, IDBKeyRange, stores, control };
}

async function openIdbStore(t) {
  const pair = await SEA.pair();
  const originalGun = globalThis.Gun;
  const originalStorage = globalThis.localStorage;
  const originalIdb = globalThis.indexedDB;
  const originalRange = globalThis.IDBKeyRange;
  const map = new Map([['signedIn', 'true'], ['alias', 'tmsteph@3dvr'], ['userPubKey', pair.pub]]);
  const writes = new Map();
  const user = { is: { pub: pair.pub, alias: 'tmsteph@3dvr' }, _: { sea: pair }, recall() {}, get() { return node; } };
  const node = { get(name) {
    if (name === 'messages') return node;
    return { put(value, ack) { writes.set(name, value); ack({ ok: 1 }); } };
  }, map() { return { on() {}, off() {} }; } };
  const Gun = () => ({ user: () => user });
  Gun.SEA = SEA;
  const fake = createFakeIndexedDB();
  globalThis.Gun = Gun;
  globalThis.localStorage = {
    get length() { return map.size; },
    key: index => [...map.keys()][index],
    getItem: key => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: key => map.delete(key)
  };
  globalThis.indexedDB = fake.indexedDB;
  globalThis.IDBKeyRange = fake.IDBKeyRange;
  t.after(() => {
    globalThis.Gun = originalGun;
    globalThis.localStorage = originalStorage;
    globalThis.indexedDB = originalIdb;
    globalThis.IDBKeyRange = originalRange;
  });
  const { openHelmMessageStore } = await import(`../operator/forge.js?helm-idb-test=${Date.now()}-${Math.random()}`);
  const prefix = `3dvr.helm.encrypted-messages.${pair.pub}:`;
  const blobKey = `3dvr.helm.encrypted-messages.${pair.pub}`;
  const record = (id, text = 'Fresh instruction', extra = {}) => ({
    id, sessionId: 'session-12345678', text,
    createdAt: Date.now(), expiresAt: Date.now() + MESSAGE_TTL_MS, updatedAt: Date.now(), status: 'queued', ...extra
  });
  const idb = () => fake.stores.get('messages') || new Map();
  const seedIdb = (key, value) => {
    if (!fake.stores.has('messages')) fake.stores.set('messages', new Map());
    fake.stores.get('messages').set(key, value);
  };
  const encrypt = async rec => ({ ciphertext: await SEA.encrypt(JSON.stringify(rec), pair), updatedAt: rec.updatedAt });
  return { pair, map, fake, writes, openHelmMessageStore, prefix, blobKey, record, idb, seedIdb, encrypt };
}

test('IndexedDB cache stores encrypted records and restores them on reopen', async t => {
  const { map, openHelmMessageStore, prefix, record, idb } = await openIdbStore(t);
  const store = await openHelmMessageStore();
  const queued = record('message-idb0001', 'Private queued instruction');
  await store.save(queued);
  const entryKey = `${prefix}${queued.id}:queued`;
  assert.equal(idb().has(entryKey), true, 'the entry lands in IndexedDB');
  assert.equal(JSON.stringify(idb().get(entryKey)).includes(queued.text), false, 'IndexedDB holds ciphertext only');
  assert.equal(map.has(entryKey), false, 'nothing is written to localStorage');
  const completed = { ...queued, status: 'completed', reply: 'Finished', updatedAt: queued.updatedAt + 1 };
  await store.save(completed);
  store.close();
  const restored = [];
  const reopened = await openHelmMessageStore({ onRecord: item => restored.push(item) });
  assert.equal(restored.length, 2, 'both states restore from IndexedDB');
  assert.equal(restored.find(item => item.status === 'completed').reply, 'Finished');
  reopened.close();
});

test('queued entries survive a store close and reopen via IndexedDB', async t => {
  const { openHelmMessageStore, record } = await openIdbStore(t);
  const store = await openHelmMessageStore();
  const queued = record('message-idb0002', 'Send this later');
  await store.save(queued);
  store.close();
  const restored = [];
  const reopened = await openHelmMessageStore({ onRecord: item => restored.push(item) });
  assert.equal(restored.length, 1);
  assert.equal(restored[0].status, 'queued', 'the unsent outbox state survives the reopen');
  assert.equal(restored[0].text, 'Send this later');
  reopened.close();
});

test('localStorage cache migrates into IndexedDB on open and frees localStorage', async t => {
  const { pair, map, openHelmMessageStore, prefix, blobKey, record, idb, encrypt } = await openIdbStore(t);
  const fromBlob = record('message-mig0001', 'From the legacy blob', { status: 'completed', reply: 'Old reply' });
  const fromEntry = record('message-mig0002', 'From a per-entry key');
  map.set(blobKey, JSON.stringify({ [`${fromBlob.id}:completed`]: await encrypt(fromBlob) }));
  map.set(`${prefix}${fromEntry.id}:queued`, JSON.stringify(await encrypt(fromEntry)));
  const restored = [];
  const store = await openHelmMessageStore({ onRecord: item => restored.push(item) });
  assert.deepEqual(restored.map(item => item.id).sort(), [fromBlob.id, fromEntry.id].sort(), 'migrated records restore');
  assert.equal(map.has(blobKey), false, 'the legacy blob is removed from localStorage');
  assert.equal(map.has(`${prefix}${fromEntry.id}:queued`), false, 'the per-entry key is removed from localStorage');
  assert.equal(idb().has(`${prefix}${fromBlob.id}:completed`), true, 'the blob record landed in IndexedDB');
  assert.equal(idb().has(`${prefix}${fromEntry.id}:queued`), true, 'the per-entry record landed in IndexedDB');
  store.close();
  const again = [];
  const reopened = await openHelmMessageStore({ onRecord: item => again.push(item) });
  assert.equal(again.length, 2, 'records restore from IndexedDB after migration');
  assert.equal(pair.pub.length > 0, true);
  reopened.close();
});

test('a failed migration keeps localStorage data and the store works on the fallback path', async t => {
  const { map, fake, openHelmMessageStore, prefix, record, idb, encrypt } = await openIdbStore(t);
  const stranded = record('message-mig0003', 'Keep me in localStorage');
  const entryKey = `${prefix}${stranded.id}:queued`;
  map.set(entryKey, JSON.stringify(await encrypt(stranded)));
  fake.control.failWrites = true;
  const restored = [];
  const store = await openHelmMessageStore({ onRecord: item => restored.push(item) });
  assert.equal(restored.length, 1, 'the record still restores, from localStorage');
  assert.equal(map.has(entryKey), true, 'localStorage data is left untouched');
  assert.equal(idb().has(entryKey), false, 'nothing partial landed in IndexedDB');
  const fresh = record('message-mig0004', 'Saved on the fallback path');
  await store.save(fresh);
  assert.equal(map.has(`${prefix}${fresh.id}:queued`), true, 'saves keep working against localStorage');
  assert.equal(idb().has(`${prefix}${fresh.id}:queued`), false, 'the fallback never touches IndexedDB');
  store.close();
});

test('the IndexedDB cache trims to the entry cap, evicting oldest history before queued states', async t => {
  const { openHelmMessageStore, prefix, record, idb, seedIdb } = await openIdbStore(t);
  for (let index = 0; index < 1000; index += 1) {
    seedIdb(`${prefix}message-h${String(index).padStart(4, '0')}:completed`, { ciphertext: 'x', updatedAt: 1000 + index });
  }
  seedIdb(`${prefix}message-seedq1:queued`, { ciphertext: 'x', updatedAt: 10 });
  const store = await openHelmMessageStore();
  const fresh = record('message-fresh07');
  await store.save(fresh);
  assert.equal(idb().size, 1000, 'the cache is trimmed back to the cap');
  assert.equal(idb().has(`${prefix}message-h0000:completed`), false, 'oldest history entry is evicted');
  assert.equal(idb().has(`${prefix}message-h0001:completed`), false, 'second-oldest history entry is evicted');
  assert.equal(idb().has(`${prefix}message-h0002:completed`), true, 'newer history is kept');
  assert.equal(idb().has(`${prefix}message-seedq1:queued`), true, 'a queued outbox state outlives history');
  assert.equal(idb().has(`${prefix}${fresh.id}:queued`), true, 'the new entry lands');
  store.close();
});

test('an IndexedDB quota failure evicts the oldest history entry and retries the save', async t => {
  const { fake, openHelmMessageStore, prefix, record, idb, seedIdb } = await openIdbStore(t);
  seedIdb(`${prefix}message-old0001:completed`, { ciphertext: 'x', updatedAt: 100 });
  seedIdb(`${prefix}message-new0002:completed`, { ciphertext: 'x', updatedAt: 200 });
  const store = await openHelmMessageStore();
  fake.control.quotaFailures = 1;
  const fresh = record('message-fresh08');
  assert.equal(await store.save(fresh), true);
  assert.equal(idb().has(`${prefix}message-old0001:completed`), false, 'oldest history entry is evicted to make room');
  assert.equal(idb().has(`${prefix}message-new0002:completed`), true, 'newer history entry is kept');
  assert.equal(idb().has(`${prefix}${fresh.id}:queued`), true, 'the new entry lands after eviction');
  store.close();
});

test("another account's IndexedDB and localStorage entries are untouched", async t => {
  const { map, openHelmMessageStore, prefix, record, idb, seedIdb, encrypt } = await openIdbStore(t);
  const otherPrefix = '3dvr.helm.encrypted-messages.someone-else-pub:';
  const otherBlobKey = '3dvr.helm.encrypted-messages.someone-else-pub';
  seedIdb(`${otherPrefix}message-other01:completed`, { ciphertext: 'x', updatedAt: 5 });
  map.set(otherBlobKey, JSON.stringify({ 'message-other02:completed': { ciphertext: 'x', updatedAt: 6 } }));
  const mine = record('message-mine001', 'My migrated record');
  map.set(`${prefix}${mine.id}:queued`, JSON.stringify(await encrypt(mine)));
  const restored = [];
  const store = await openHelmMessageStore({ onRecord: item => restored.push(item) });
  assert.deepEqual(restored.map(item => item.id), [mine.id], 'only this account restores');
  assert.equal(idb().has(`${otherPrefix}message-other01:completed`), true, "another account's IndexedDB entry is untouched");
  assert.equal(map.has(otherBlobKey), true, "another account's localStorage blob is untouched");
  assert.equal(map.has(`${prefix}${mine.id}:queued`), false, 'own entry migrated out of localStorage');
  assert.equal(idb().has(`${prefix}${mine.id}:queued`), true, 'own entry landed in IndexedDB');
  store.close();
});

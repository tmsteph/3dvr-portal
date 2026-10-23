import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../src/auth/sea.js';
import SEA from 'gun/sea.js';
import { openPrivateCellStore } from '../cell/private-store.js';
import { openCellAccount } from '../operator/forge.js';

function memoryStorage() {
  const data = new Map([['signedIn', 'true'], ['alias', 'owner']]);
  return {
    data, get length() { return data.size; }, key: index => [...data.keys()][index],
    getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value)
  };
}

async function setup() {
  const pair = await SEA.pair();
  const storage = memoryStorage();
  storage.setItem('userPubKey', pair.pub);
  const writes = [];
  let listener;
  let ack = { ok: 1 };
  let stopped = false;
  function node(path = []) {
    return {
      get(key) { return node([...path, key]); },
      put(value, callback) { writes.push({ path, value }); if (ack) callback(ack); },
      map() { return {
        on(callback) { listener = callback; },
        off() { stopped = true; }
      }; }
    };
  }
  const user = { ...node(), is: { pub: pair.pub } };
  const getAccount = async () => ({ pair, sea: SEA, user });
  const record = { id: 'opaque-cell-id', name: 'Private group name', purpose: 'Private purpose',
    pillars: 'care, support', updatedAt: '2026-10-23T01:00:00.000Z' };
  return {
    pair, storage, writes, user, getAccount, record,
    ack(value) { ack = value; },
    deliver(value, id) { listener(value, id); },
    get stopped() { return stopped; }
  };
}
const flush = () => new Promise(resolve => setTimeout(resolve, 30));

test('stores only ciphertext under owner graph, restores owner cache, rejects another key', async () => {
  const f = await setup();
  const seen = [];
  const store = await openPrivateCellStore({ ...f, onCell: value => seen.push(value) });
  await store.save(f.record);
  assert.deepEqual(f.writes[0].path, ['cell-v1', 'cells', f.record.id]);
  assert.deepEqual(Object.keys(f.writes[0].value), ['ciphertext']);
  const serialized = JSON.stringify([...f.storage.data, ...f.writes]);
  assert.equal(serialized.includes(f.record.name), false);
  assert.equal(serialized.includes(f.record.purpose), false);
  const restored = [];
  const second = await openPrivateCellStore({ ...f, onCell: value => restored.push(value) });
  assert.equal(restored[0].purpose, f.record.purpose);
  assert.equal(restored[0].ownerPub, f.pair.pub);
  const outsider = await SEA.pair();
  const previousThrow = SEA.throw;
  SEA.throw = false;
  try { assert.equal(await SEA.decrypt(f.writes[0].value.ciphertext, outsider), undefined); }
  finally { SEA.throw = previousThrow; }
  store.close(); second.close();
});

test('account switch during encryption prevents cache and relay writes', async () => {
  const f = await setup();
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const getAccount = async () => ({ pair: f.pair, user: f.user,
    sea: { ...SEA, async encrypt(...args) { await gate; return SEA.encrypt(...args); } } });
  const store = await openPrivateCellStore({ storage: f.storage, getAccount });
  const saving = store.save(f.record);
  f.storage.setItem('userPubKey', 'other-account');
  release();
  await assert.rejects(saving, /Account changed/);
  assert.equal(f.writes.length, 0);
  assert.equal([...f.storage.data.keys()].some(key => key.startsWith('3dvr.cell.private.')), false);
  store.close();
});

test('ignores foreign, stale and late closed-store deliveries', async () => {
  const f = await setup();
  const seen = [];
  const store = await openPrivateCellStore({ ...f, onCell: record => seen.push(record) });
  await store.save(f.record);
  const envelope = async record => ({ ciphertext: await SEA.encrypt(JSON.stringify(record), f.pair) });
  f.deliver(await envelope({ ...f.record, ownerPub: 'outsider' }), f.record.id);
  f.deliver(await envelope({ ...f.record, ownerPub: f.pair.pub, updatedAt: '2020-01-01T00:00:00.000Z' }), f.record.id);
  await flush();
  assert.equal(seen.length, 1);
  store.close();
  f.deliver(f.writes[0].value, f.record.id);
  await flush();
  assert.equal(seen.length, 1);
  assert.equal(f.stopped, true);
});

test('no relay acknowledgement retains encrypted local data and reports sync pending', async () => {
  const f = await setup();
  f.ack(null);
  const store = await openPrivateCellStore({ ...f, timeoutMs: 10 });
  assert.equal((await store.save(f.record)).pendingSync, true);
  assert.ok(f.storage.getItem(`3dvr.cell.private.${f.pair.pub}.${f.record.id}`));
  store.close();
});

test('encryption or browser storage failure never falls back to a public write', async () => {
  const f = await setup();
  const brokenEncryption = await openPrivateCellStore({ storage: f.storage,
    getAccount: async () => ({ pair: f.pair, user: f.user, sea: { ...SEA, encrypt: async () => undefined } }) });
  await assert.rejects(brokenEncryption.save(f.record), /Encryption failed/);
  brokenEncryption.close();
  const store = await openPrivateCellStore(f);
  f.storage.setItem = () => { throw new Error('Storage full'); };
  await assert.rejects(store.save(f.record), /Storage full/);
  assert.equal(f.writes.length, 0);
  store.close();
});

test('signed-out visitor cannot open account store using a cached username', async t => {
  const original = globalThis.localStorage;
  globalThis.localStorage = { getItem: key => key === 'username' ? 'tmsteph' : null };
  t.after(() => { globalThis.localStorage = original; });
  await assert.rejects(openCellAccount(), /Sign in/);
});

test('account unlock accepts a verified recalled key and rejects a spoofed cached account key', async t => {
  const originalGun = globalThis.Gun;
  const originalStorage = globalThis.localStorage;
  t.after(() => { globalThis.Gun = originalGun; globalThis.localStorage = originalStorage; });
  const pair = await SEA.pair();
  const storage = memoryStorage();
  storage.setItem('userPubKey', pair.pub);
  const user = {
    is: { pub: pair.pub, alias: pair.pub }, _: { sea: pair }, recall() {},
    leave() { this.is = null; this._.sea = null; }
  };
  const Gun = () => ({ user: () => user });
  Gun.SEA = SEA;
  globalThis.Gun = Gun;
  globalThis.localStorage = storage;
  const { openCellAccount: unlock } = await import('../operator/forge.js?cell-private-auth-test');
  assert.equal((await unlock()).pair.pub, pair.pub);
  storage.setItem('userPubKey', (await SEA.pair()).pub);
  await assert.rejects(unlock(), /Sign in again/);
});

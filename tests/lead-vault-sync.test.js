import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createBrowserLeadVaultSync,
  createLeadVaultSync
} from '../src/money-printer/leadVaultSync.js';
import {
  mergeLeadVaultRecords,
  readLeadVault,
  writeLeadVault
} from '../src/money-printer/leadVault.js';

function memoryStorage(seed = []) {
  const values = new Map();
  const storage = {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
    removeItem(key) { values.delete(key); }
  };
  writeLeadVault(seed, storage);
  return storage;
}

function fakeGun(remoteLeads = []) {
  const state = {
    record: {
      ciphertext: 'enc:' + JSON.stringify({
        schemaVersion: 1,
        leads: remoteLeads,
        updatedAt: '2026-09-19T00:00:00.000Z'
      })
    },
    listeners: []
  };

  const node = {
    get() { return node; },
    once(callback) { callback(state.record); },
    put(value, callback) {
      state.record = value;
      callback?.({ ok: 1 });
      state.listeners.forEach(listener => listener(value));
    },
    on(callback) {
      state.listeners.push(callback);
      if (state.record) callback(state.record);
      return node;
    },
    off() { state.listeners.length = 0; }
  };

  const user = {
    is: { pub: 'pub-test' },
    _: { sea: { priv: 'private-test' } },
    get() { return node; },
    recall() {}
  };

  const GunImpl = () => ({ user: () => user });
  const SEA = {
    async encrypt(value) { return 'enc:' + value; },
    async decrypt(value) {
      return String(value || '').startsWith('enc:')
        ? String(value).slice(4)
        : null;
    }
  };

  return { state, node, user, GunImpl, SEA };
}

test('Lead Vault merge keeps the newest details and furthest lifecycle state', () => {
  const merged = mergeLeadVaultRecords(
    [{
      id: 'hello@example.test',
      email: 'hello@example.test',
      name: 'Old Name',
      status: 'sent',
      updatedAt: '2026-09-19T01:00:00Z',
      firstSeenAt: '2026-09-18T20:00:00Z'
    }],
    [{
      id: 'HELLO@example.test',
      email: 'HELLO@example.test',
      name: 'New Name',
      status: 'discovered',
      updatedAt: '2026-09-19T02:00:00Z',
      firstSeenAt: '2026-09-19T00:00:00Z'
    }]
  );

  assert.equal(merged.length, 1);
  assert.equal(merged[0].email, 'hello@example.test');
  assert.equal(merged[0].name, 'New Name');
  assert.equal(merged[0].status, 'sent');
  assert.equal(merged[0].firstSeenAt, '2026-09-18T20:00:00Z');
});

test('signed-in Lead Vault sync merges local and encrypted remote records', async () => {
  const remote = [{
    id: 'remote@example.test',
    email: 'remote@example.test',
    name: 'Remote Lead',
    status: 'selected',
    updatedAt: '2026-09-19T02:00:00Z'
  }];
  const local = [{
    id: 'local@example.test',
    email: 'local@example.test',
    name: 'Local Lead',
    status: 'discovered',
    updatedAt: '2026-09-19T01:00:00Z'
  }];
  const { GunImpl, SEA } = fakeGun(remote);
  const storage = memoryStorage(local);

  const accountSync = await createBrowserLeadVaultSync({
    GunImpl,
    SEA,
    storage,
    authTimeoutMs: 5
  });

  assert.equal(accountSync.available, true);
  assert.equal(accountSync.leads.length, 2);
  assert.equal(readLeadVault(storage).length, 2);

  const remoteAfter = await accountSync.sync.read();
  assert.equal(remoteAfter.length, 2);
  accountSync.unsubscribe();
});

test('live remote Lead Vault updates reconcile into an open signed-in device', async () => {
  const { node, GunImpl, SEA } = fakeGun([]);
  const storage = memoryStorage([]);
  let seen = [];
  const accountSync = await createBrowserLeadVaultSync({
    GunImpl,
    SEA,
    storage,
    authTimeoutMs: 5,
    onRemoteMerge: leads => { seen = leads; }
  });

  const remotePayload = {
    schemaVersion: 1,
    leads: [{
      id: 'new@example.test',
      email: 'new@example.test',
      name: 'Live Remote',
      status: 'discovered',
      updatedAt: '2026-09-19T03:00:00Z'
    }]
  };
  node.put(
    { ciphertext: await SEA.encrypt(JSON.stringify(remotePayload)) },
    () => {}
  );
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.equal(seen.length, 1);
  assert.equal(readLeadVault(storage)[0].name, 'Live Remote');
  accountSync.unsubscribe();
});

test('low-level Lead Vault sync is unavailable without an authenticated user', () => {
  const sync = createLeadVaultSync({
    user: { is: null, _: {}, get() {} },
    SEA: {}
  });
  assert.equal(sync.available, false);
});

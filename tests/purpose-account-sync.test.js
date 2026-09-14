import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  createPurposeAccountRuntime,
  pickNewestPurposeState
} from '../purpose/account-sync.js';

test('Purpose page wires Gun, SEA, identity, and the account-sync bootstrap', async () => {
  const html = await readFile(new URL('../purpose/index.html', import.meta.url), 'utf8');
  assert.match(html, /gun\/gun\.js/);
  assert.match(html, /gun\/sea\.js/);
  assert.match(html, /auth-identity\.js/);
  assert.match(html, /purpose\/account-sync\.js/);
  assert.match(html, /encrypted to your account/i);
});

test('Purpose account bridge chooses the newest state before the app initializes', () => {
  const local = {
    answers: ['', 'local focus', '', '', ''],
    updatedAt: '2026-09-14T19:00:00Z'
  };
  const remote = {
    answers: ['', 'new remote focus', '', '', ''],
    updatedAt: '2026-09-14T20:00:00Z'
  };
  assert.equal(pickNewestPurposeState(local, remote).answers[1], 'new remote focus');
  assert.equal(pickNewestPurposeState(remote, local).answers[1], 'new remote focus');
});

test('signed-out Purpose skips Gun recall so local startup stays immediate', async () => {
  let gunCalls = 0;
  const windowObj = {
    Gun() { gunCalls += 1; throw new Error('signed-out path must not open Gun'); },
    SEA: { encrypt() {}, decrypt() {} },
    AuthIdentity: { readSharedIdentity() { return { signedIn: false }; } },
    localStorage: {
      getItem() { return null; },
      setItem() {}
    },
    document: { querySelector() { return null; } },
    setTimeout
  };

  const runtime = await createPurposeAccountRuntime({ windowObj });
  assert.equal(runtime.available, false);
  assert.equal(gunCalls, 0);
});

test('Purpose account runtime restores a newer encrypted account copy into local storage', async () => {
  const storageValues = new Map();
  const local = {
    answers: ['', 'local focus', '', '', ''],
    updatedAt: '2026-09-14T19:00:00Z'
  };
  const remote = {
    answers: ['', 'remote focus', 'builders', 'open tools', 'ship one'],
    updatedAt: '2026-09-14T20:00:00Z'
  };
  storageValues.set('3dvr-purpose-draft-v1', JSON.stringify(local));
  storageValues.set('signedIn', 'true');
  const node = {
    get() { return this; },
    once(callback) { callback({ ciphertext: 'remote-cipher' }); },
    put(_value, callback) { callback({ ok: 1 }); }
  };
  const user = {
    is: { pub: 'public-key' },
    _: { sea: { priv: 'private-key' } },
    recall() {},
    get() { return node; }
  };
  const SEA = {
    async decrypt(value) { return value === 'remote-cipher' ? JSON.stringify(remote) : null; },
    async encrypt(value) { return `encrypted:${value.length}`; }
  };
  const windowObj = {
    Gun() { return { user() { return user; } }; },
    SEA,
    AuthIdentity: {},
    localStorage: {
      getItem(key) { return storageValues.get(key) ?? null; },
      setItem(key, value) { storageValues.set(key, value); }
    },
    document: { querySelector() { return null; } },
    setTimeout
  };

  const runtime = await createPurposeAccountRuntime({ windowObj });
  assert.equal(runtime.available, true);
  assert.equal(runtime.restored, true);
  assert.equal(JSON.parse(storageValues.get('3dvr-purpose-draft-v1')).answers[1], 'remote focus');
});

test('Purpose sync stores private data only through encrypted account nodes', async () => {
  const source = await readFile(new URL('../purpose/account-sync.js', import.meta.url), 'utf8');
  assert.match(source, /SEA\.encrypt/);
  assert.match(source, /createAlignmentProfileSync/);
  assert.doesNotMatch(source, /gun\.get\(['"]purpose['"]\)/);
  assert.match(source, /user\.get\(['"]purpose['"]\)/);
});

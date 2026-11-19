import assert from 'node:assert/strict';
import test from 'node:test';
import {
  pickConversationStoreSource,
  retireLegacyConversationHistory
} from '../operator/conversation-store.js';

const BASE_KEY = '3dvr.operator.conversations.v2';
const LEGACY_KEY = '3dvr.operator.history.v1';
const ACCOUNT_KEY = `${BASE_KEY}.account.alice%40example.com`;

function fakeStorage(entries = {}) {
  const map = new Map(Object.entries(entries));
  return {
    map,
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    removeItem(key) {
      map.delete(key);
    }
  };
}

const guestStore = JSON.stringify({ activeId: 'guest-conversation', conversations: [{ id: 'guest-conversation', messages: [] }] });
const accountStore = JSON.stringify({ activeId: 'account-conversation', conversations: [{ id: 'account-conversation', messages: [] }] });
const legacyHistory = JSON.stringify([{ role: 'user', content: 'before partitioning' }]);

test('account bucket reads its own stored conversations', () => {
  const storage = fakeStorage({ [ACCOUNT_KEY]: accountStore, [BASE_KEY]: guestStore });
  const source = pickConversationStoreSource(storage, { key: ACCOUNT_KEY, baseKey: BASE_KEY, legacyKey: LEGACY_KEY });
  assert.equal(source.raw, accountStore);
  assert.equal(source.legacy, '');
});

test('account bucket never falls back to the guest bucket', () => {
  const storage = fakeStorage({ [BASE_KEY]: guestStore });
  const source = pickConversationStoreSource(storage, { key: ACCOUNT_KEY, baseKey: BASE_KEY, legacyKey: LEGACY_KEY });
  assert.equal(source.raw, '');
  assert.equal(source.legacy, '');
});

test('account bucket never adopts the pre-partition legacy history', () => {
  const storage = fakeStorage({ [LEGACY_KEY]: legacyHistory });
  const source = pickConversationStoreSource(storage, { key: ACCOUNT_KEY, baseKey: BASE_KEY, legacyKey: LEGACY_KEY });
  assert.equal(source.raw, '');
  assert.equal(source.legacy, '');
});

test('a second account never sees the first account bucket or the guest bucket', () => {
  const otherKey = `${BASE_KEY}.account.bob%40example.com`;
  const storage = fakeStorage({ [ACCOUNT_KEY]: accountStore, [BASE_KEY]: guestStore, [LEGACY_KEY]: legacyHistory });
  const source = pickConversationStoreSource(storage, { key: otherKey, baseKey: BASE_KEY, legacyKey: LEGACY_KEY });
  assert.deepEqual(source, { raw: '', legacy: '' });
});

test('guest bucket reads its own stored conversations', () => {
  const storage = fakeStorage({ [BASE_KEY]: guestStore });
  const source = pickConversationStoreSource(storage, { key: BASE_KEY, baseKey: BASE_KEY, legacyKey: LEGACY_KEY });
  assert.equal(source.raw, guestStore);
  assert.equal(source.legacy, '');
});

test('guest bucket may adopt the legacy history it was written for', () => {
  const storage = fakeStorage({ [LEGACY_KEY]: legacyHistory });
  const source = pickConversationStoreSource(storage, { key: BASE_KEY, baseKey: BASE_KEY, legacyKey: LEGACY_KEY });
  assert.equal(source.raw, '');
  assert.equal(source.legacy, legacyHistory);
});

test('only the guest bucket retires the legacy key after a save', () => {
  const guest = fakeStorage({ [LEGACY_KEY]: legacyHistory, [BASE_KEY]: guestStore });
  retireLegacyConversationHistory(guest, { key: BASE_KEY, baseKey: BASE_KEY, legacyKey: LEGACY_KEY });
  assert.equal(guest.map.has(LEGACY_KEY), false);
  assert.equal(guest.map.get(BASE_KEY), guestStore);

  const account = fakeStorage({ [LEGACY_KEY]: legacyHistory, [BASE_KEY]: guestStore });
  retireLegacyConversationHistory(account, { key: ACCOUNT_KEY, baseKey: BASE_KEY, legacyKey: LEGACY_KEY });
  assert.equal(account.map.get(LEGACY_KEY), legacyHistory);
  assert.equal(account.map.get(BASE_KEY), guestStore);
});

test('storage that throws on read is treated as empty, never as another bucket', () => {
  const storage = {
    getItem() {
      throw new Error('storage unavailable');
    },
    removeItem() {}
  };
  const source = pickConversationStoreSource(storage, { key: ACCOUNT_KEY, baseKey: BASE_KEY, legacyKey: LEGACY_KEY });
  assert.deepEqual(source, { raw: '', legacy: '' });
});

import test from 'node:test';
import assert from 'node:assert/strict';

function createStorage() {
  const store = new Map();
  return {
    getItem(key) {
      return store.get(key) ?? '';
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    }
  };
}

globalThis.localStorage = createStorage();
globalThis.window = globalThis;

await import('../score.js');

const { ScoreSystem } = globalThis;

test('resolveDisplayName prefers signed-in username', () => {
  const storage = createStorage();
  storage.setItem('signedIn', 'true');
  storage.setItem('username', 'PortalUser');
  storage.setItem('alias', 'portal@3dvr');
  const name = ScoreSystem.resolveDisplayName({
    authState: { mode: 'user' },
    storage
  });
  assert.equal(name, 'PortalUser');
});

test('resolveDisplayName uses alias when signed in and username missing', () => {
  const storage = createStorage();
  storage.setItem('signedIn', 'true');
  storage.setItem('alias', 'alpha@3dvr');
  const name = ScoreSystem.resolveDisplayName({
    authState: { mode: 'user' },
    storage
  });
  assert.equal(name, 'alpha');
});

test('resolveDisplayName uses guest name for guest sessions', () => {
  const storage = createStorage();
  storage.setItem('guestDisplayName', 'Visitor');
  const name = ScoreSystem.resolveDisplayName({
    authState: { mode: 'guest' },
    storage
  });
  assert.equal(name, 'Visitor');
});

test('resolveDisplayName avoids Guest for signed-in sessions', () => {
  const storage = createStorage();
  storage.setItem('signedIn', 'true');
  const name = ScoreSystem.resolveDisplayName({
    authState: { mode: 'user' },
    storage
  });
  assert.equal(name, 'Account');
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { createAlignmentProfileSync } from '../src/kernel/alignmentProfileSync.js';

function fakeUser() {
  let stored = null;
  const node = {
    get() { return this; },
    once(callback) { callback(stored); },
    put(value, callback) { stored = value; callback({ ok: 1 }); }
  };
  return {
    is: { pub: 'public-key' },
    _: { sea: { priv: 'private-key' } },
    get() { return node; },
    readStored() { return stored; }
  };
}

const encrypted = new Map();
const fakeSea = {
  async encrypt(value) {
    const key = `cipher-${encrypted.size + 1}`;
    encrypted.set(key, value);
    return key;
  },
  async decrypt(value) {
    return encrypted.get(value);
  }
};

test('alignment profile sync encrypts before account storage and restores normalized data', async () => {
  const user = fakeUser();
  const sync = createAlignmentProfileSync({ user, SEA: fakeSea });
  const profile = {
    source: 'purpose-map',
    keywords: ['audio', 'freelancers'],
    focusAreas: ['Open source audio'],
    updatedAt: '2026-09-14T20:00:00Z'
  };

  assert.equal(sync.available, true);
  assert.equal(await sync.write(profile), true);
  assert.match(user.readStored().ciphertext, /^cipher-/);
  assert.doesNotMatch(JSON.stringify(user.readStored()), /freelancers/);
  const restored = await sync.read();
  assert.deepEqual(restored.keywords, ['audio', 'freelancers']);
  assert.equal(restored.source, 'purpose-map');
});

test('alignment profile sync does not write for guests', async () => {
  const sync = createAlignmentProfileSync({ user: {}, SEA: fakeSea });
  assert.equal(sync.available, false);
  assert.equal(await sync.write({ keywords: ['private'] }), false);
});

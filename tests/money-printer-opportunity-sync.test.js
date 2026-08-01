import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createOpportunityEngineSync,
  mergeOpportunityEngineStates
} from '../src/money-printer/opportunityEngineSync.js';
import { addOpportunity, createOpportunityEngineState } from '../src/money-printer/opportunityEngine.js';

function fakeGunUser() {
  let stored = null;
  const node = {
    get() { return this; },
    once(callback) { callback(stored); },
    put(value, callback) { stored = value; callback({ ok: 1 }); }
  };
  return {
    is: { pub: 'test-public-key' },
    _: { sea: { priv: 'private-key' } },
    get() { return node; },
    readStored() { return stored; }
  };
}

const encryptedValues = new Map();
const fakeSea = {
  async encrypt(value) {
    const ciphertext = `encrypted-${encryptedValues.size + 1}`;
    encryptedValues.set(ciphertext, value);
    return ciphertext;
  },
  async decrypt(value) { return encryptedValues.get(value); }
};

describe('Opportunity Engine shared storage', () => {
  it('merges records by id and keeps the newest version', () => {
    const first = addOpportunity(createOpportunityEngineState(), {
      id: 'op-1', need: 'Old title', buyerWords: 'Original request'
    }, new Date('2026-08-01T10:00:00Z'));
    const newer = {
      ...first,
      opportunities: [{ ...first.opportunities[0], title: 'Updated title', updatedAt: '2026-08-01T11:00:00Z' }],
      updatedAt: '2026-08-01T11:00:00Z'
    };
    const merged = mergeOpportunityEngineStates(first, newer, new Date('2026-08-01T12:00:00Z'));
    assert.equal(merged.opportunities.length, 1);
    assert.equal(merged.opportunities[0].title, 'Updated title');
  });

  it('encrypts before writing and decrypts after reading', async () => {
    const user = fakeGunUser();
    const sync = createOpportunityEngineSync({ user, SEA: fakeSea });
    const state = addOpportunity(createOpportunityEngineState(), {
      need: 'Private buyer request', buyerWords: 'Please do not publish this'
    });
    assert.equal(sync.available, true);
    await sync.write(state);
    assert.match(user.readStored().ciphertext, /^encrypted-/);
    assert.doesNotMatch(JSON.stringify(user.readStored()), /Private buyer request/);
    const restored = await sync.read();
    assert.equal(restored.opportunities[0].title, 'Private buyer request');
  });

  it('stays unavailable for guests instead of writing to a public graph', () => {
    const sync = createOpportunityEngineSync({ user: { get() { throw new Error('must not write'); } }, SEA: fakeSea });
    assert.equal(sync.available, false);
  });
});

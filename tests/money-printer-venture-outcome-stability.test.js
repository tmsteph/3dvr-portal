import assert from 'node:assert/strict';
import test from 'node:test';
import {
  deriveVentureOutcomeMemory,
  ventureOutcomeMemoryKey,
} from '../src/money-printer/ventureOutcomeMemory.js';
import { createVentureOutcomeMemorySync } from '../src/money-printer/ventureOutcomeMemorySync.js';

function terminalState() {
  return {
    experiments: [{
      id: 'won-audio',
      status: 'Revenue',
      name: 'Audio workflow',
      customer: 'audio freelancers',
      pain: 'tool fragmentation',
      offer: 'workflow automation',
      capsule: {
        status: 'won',
        updatedAt: '2099-09-14T16:23:00.000Z',
      },
      marketPulse: {
        sourceOpportunityId: 'audio',
        sourceRunId: 'run-a',
      },
    }],
  };
}

test('unchanged terminal outcomes keep the same private learning key across later saves', () => {
  const first = deriveVentureOutcomeMemory(terminalState(), new Date('2099-09-15T00:00:00.000Z'));
  const later = deriveVentureOutcomeMemory(terminalState(), new Date('2099-09-16T00:00:00.000Z'));

  assert.equal(first.entries[0].observedAt, '2099-09-14T16:23:00.000Z');
  assert.equal(ventureOutcomeMemoryKey(first), ventureOutcomeMemoryKey(later));
});

test('encrypted outcome sync becomes a no-op when memory has not changed', async () => {
  let storedRecord = null;
  let putCount = 0;
  const node = {
    once(callback) { callback(storedRecord); },
    put(value, callback) {
      storedRecord = value;
      putCount += 1;
      callback({ ok: 1 });
    },
  };
  const user = {
    is: { pub: 'pub' },
    _: { sea: { priv: 'priv' } },
    get() { return { get() { return node; } }; },
  };
  const SEA = {
    async encrypt(value) { return `cipher:${value}`; },
    async decrypt(value) { return String(value).replace(/^cipher:/, ''); },
  };
  const sync = createVentureOutcomeMemorySync({ user, SEA });
  const memory = deriveVentureOutcomeMemory(terminalState());

  assert.equal(await sync.write(memory), true);
  assert.equal(await sync.write(memory), false);
  assert.equal(putCount, 1);
});

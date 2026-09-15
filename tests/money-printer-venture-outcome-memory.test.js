import assert from 'node:assert/strict';
import test from 'node:test';
import { serializeMarketPulseCapsuleCandidates } from '../src/growth/market-pulse-capsules.js';
import { createDefaultMoneyPrinterState } from '../src/money-printer/moneyPrinterCore.js';
import { ingestMarketPulseCapsuleCandidates } from '../src/money-printer/marketPulseIngest.js';
import {
  personalizeMarketPulseCapsulePayload,
  personalizeMarketPulseCandidate,
  privatePersonalizationKey,
} from '../src/money-printer/privateAlignmentRanking.js';
import { importLatestMarketPulseCapsules, readMoneyPrinterState } from '../src/money-printer/moneyPrinterStorage.js';
import { syncPrivateVentureOutcomeMemory } from '../src/money-printer/privateVentureLearningRuntime.js';
import {
  deriveVentureOutcomeMemory,
  mergeVentureOutcomeMemory,
  normalizeVentureOutcomeMemory,
  scoreVentureOutcomeMemory,
  ventureOutcomeMemoryKey,
} from '../src/money-printer/ventureOutcomeMemory.js';
import { createVentureOutcomeMemorySync } from '../src/money-printer/ventureOutcomeMemorySync.js';

function candidate({ id, title, pain, buyer, offer, priorityScore = 80, mode = 'portfolio' } = {}) {
  return {
    id: `candidate-${id}`,
    sourceRunId: 'run-1',
    sourceOpportunityId: id,
    title,
    pain,
    buyer,
    offer,
    suggestedPrice: '$300 setup',
    evidence: ['paid demand'],
    marketScore: 80,
    profitScore: 80,
    alignmentScore: 50,
    fulfillmentScore: 80,
    capsule: {
      id: `capsule-${id}`,
      sourceId: `experiment-market-pulse-${id}`,
      mode,
      buyer,
      offer,
      priorityScore,
      status: 'queued',
      budgetCapCents: 0,
      policy: {
        maxAutomatedSpendCents: 0,
        externalWrites: 'approval-required',
        irreversibleActions: 'approval-required',
      },
    },
  };
}

function memoryEntry(overrides = {}) {
  return {
    id: 'audio-workflow',
    sourceOpportunityId: 'audio-workflow',
    sourceRunId: 'old-run',
    title: 'Audio workflow for freelancers',
    buyer: 'freelance audio engineers',
    pain: 'Freelancers lose time between disconnected audio tools',
    offer: 'Open audio workflow automation',
    outcome: 'won',
    observedAt: '2099-09-14T18:00:00.000Z',
    ...overrides,
  };
}

function fakeStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
    removeItem(key) { values.delete(key); },
  };
}

test('outcome memory captures only terminal Market Pulse experiments', () => {
  const state = {
    experiments: [
      {
        id: 'won-exp', status: 'Revenue', name: 'Audio workflow', customer: 'audio freelancers', pain: 'tool fragmentation', offer: 'workflow automation',
        capsule: { status: 'won' }, marketPulse: { sourceOpportunityId: 'audio', sourceRunId: 'run-a' },
      },
      {
        id: 'killed-exp', status: 'Killed', name: 'Pool routes', customer: 'pool companies', pain: 'routing', offer: 'route planner',
        capsule: { status: 'killed' }, marketPulse: { sourceOpportunityId: 'pools', sourceRunId: 'run-b' },
      },
      {
        id: 'active-exp', status: 'Validating', name: 'Still testing', customer: 'teams', pain: 'pain', offer: 'offer',
        capsule: { status: 'active' }, marketPulse: { sourceOpportunityId: 'active', sourceRunId: 'run-c' },
      },
    ],
  };
  const memory = deriveVentureOutcomeMemory(state, new Date('2099-09-15T00:00:00.000Z'));

  assert.equal(memory.entries.length, 2);
  assert.deepEqual(memory.entries.map((entry) => entry.outcome).sort(), ['killed', 'won']);
  assert.equal(memory.entries.some((entry) => entry.id === 'active'), false);
});

test('newer terminal evidence replaces the older outcome for the same opportunity', () => {
  const older = normalizeVentureOutcomeMemory({ entries: [memoryEntry({ outcome: 'killed', observedAt: '2099-09-14T10:00:00.000Z' })] });
  const newer = normalizeVentureOutcomeMemory({ entries: [memoryEntry({ outcome: 'won', observedAt: '2099-09-14T18:00:00.000Z' })] });
  const merged = mergeVentureOutcomeMemory(older, newer);

  assert.equal(merged.entries.length, 1);
  assert.equal(merged.entries[0].outcome, 'won');
  assert.equal(merged.entries[0].observedAt, '2099-09-14T18:00:00.000Z');
});

test('wins raise similar candidates, kills lower them, and unrelated history does not move them', () => {
  const audio = candidate({
    id: 'new-audio',
    title: 'Audio workflow automation for freelancers',
    pain: 'Audio freelancers lose time moving between tools',
    buyer: 'freelance audio engineers',
    offer: 'Open audio workflow automation',
  });
  const wonMemory = normalizeVentureOutcomeMemory({ entries: [memoryEntry()] });
  const killedMemory = normalizeVentureOutcomeMemory({ entries: [memoryEntry({ outcome: 'killed' })] });
  const unrelatedMemory = normalizeVentureOutcomeMemory({ entries: [memoryEntry({
    id: 'dentist', title: 'Dental appointment reminders', buyer: 'dentists', pain: 'missed appointments', offer: 'SMS reminders', outcome: 'won',
  })] });

  assert.ok(scoreVentureOutcomeMemory(audio, wonMemory).adjustment > 0);
  assert.ok(scoreVentureOutcomeMemory(audio, killedMemory).adjustment < 0);
  assert.equal(scoreVentureOutcomeMemory(audio, unrelatedMemory).adjustment, 0);
});

test('outcome learning changes priority but never resurrects a zero-priority candidate', () => {
  const learned = normalizeVentureOutcomeMemory({ entries: [memoryEntry()] });
  const aligned = candidate({
    id: 'audio',
    title: 'Audio workflow for freelancers',
    pain: 'Audio freelancers lose time between tools',
    buyer: 'freelance audio engineers',
    offer: 'Open audio workflow automation',
    priorityScore: 80,
  });
  const zero = candidate({ ...aligned, id: 'zero', priorityScore: 0 });
  const learnedCandidate = personalizeMarketPulseCandidate(aligned, {}, learned);
  const zeroCandidate = personalizeMarketPulseCandidate(zero, {}, learned);

  assert.ok(learnedCandidate.capsule.priorityScore > 80);
  assert.ok(learnedCandidate.outcomeLearningAdjustment > 0);
  assert.equal(zeroCandidate.capsule.priorityScore, 0);
});

test('a changed private outcome memory re-ranks the same public Market Pulse run', () => {
  const audio = candidate({
    id: 'audio', title: 'Audio workflow for freelancers', pain: 'Audio tool fragmentation', buyer: 'audio freelancers', offer: 'Open audio workflow automation',
  });
  const pools = candidate({
    id: 'pools', title: 'Pool route workflow', pain: 'Pool routing inefficiency', buyer: 'pool companies', offer: 'Route scheduling automation',
  });
  const publicPayload = { runId: 'same-run', generatedAt: '2099-09-14T16:00:00.000Z', candidates: [audio, pools] };
  const first = ingestMarketPulseCapsuleCandidates(createDefaultMoneyPrinterState(), publicPayload);
  const learned = normalizeVentureOutcomeMemory({ entries: [memoryEntry()] });
  const personalizedPayload = personalizeMarketPulseCapsulePayload(publicPayload, {}, learned);
  const second = ingestMarketPulseCapsuleCandidates(first.state, personalizedPayload);
  const active = second.state.experiments.find((item) => item.capsule?.status === 'active');

  assert.equal(second.skipped, false);
  assert.equal(second.state.marketPulseLastImportedRunId, 'same-run');
  assert.equal(second.state.marketPulseLastPersonalizationKey, privatePersonalizationKey({}, learned));
  assert.equal(active.id, 'experiment-market-pulse-audio');
});

test('venture outcome memory round-trips through encrypted account storage', async () => {
  let storedRecord = null;
  const node = {
    once(callback) { callback(storedRecord); },
    put(value, callback) { storedRecord = value; callback({ ok: 1 }); },
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
  const memory = normalizeVentureOutcomeMemory({ entries: [memoryEntry()] });

  assert.equal(await sync.write(memory), true);
  assert.ok(storedRecord.ciphertext.startsWith('cipher:'));
  const restored = await sync.read();
  assert.equal(restored.entries.length, 1);
  assert.equal(restored.entries[0].outcome, 'won');
  assert.equal(ventureOutcomeMemoryKey(restored), ventureOutcomeMemoryKey(memory));
});

test('signed-in browser import applies encrypted outcome learning without storing raw memory', async () => {
  const source = {
    runId: 'browser-learning-run',
    generatedAt: '2099-09-14T16:23:00.000Z',
    profile: { searchMode: 'portfolio' },
    opportunities: [
      {
        id: 'audio', title: 'Audio workflow for freelancers', problem: 'Audio freelancers lose time between tools', audience: 'freelance audio engineers', solution: 'Open audio workflow automation', suggestedPrice: '$300 setup', score: 80, marketScore: 80, profitScore: 80, alignmentScore: 50, fulfillmentScore: 80,
      },
      {
        id: 'pools', title: 'Pool route workflow', problem: 'Pool routing is inefficient', audience: 'pool companies', solution: 'Route scheduling automation', suggestedPrice: '$300 setup', score: 80, marketScore: 80, profitScore: 80, alignmentScore: 50, fulfillmentScore: 80,
      },
    ],
  };
  const queueRecord = serializeMarketPulseCapsuleCandidates(source);
  const outcomeMemory = normalizeVentureOutcomeMemory({ entries: [memoryEntry()] });
  const storage = fakeStorage({ signedIn: 'true' });

  function makeNode(path = [], account = false) {
    return {
      get(key) { return makeNode([...path, key], account); },
      once(callback) {
        const joined = path.join('/');
        if (!account && joined === '3dvr-portal/growth/market-pulse/venture-capsules/latest') callback(queueRecord);
        else if (account && joined === 'kernel/alignment-profile-v1') callback(null);
        else if (account && joined === 'kernel/venture-outcome-memory-v1') callback({ ciphertext: 'outcome-cipher' });
        else callback(null);
      },
      put(_value, callback) { callback?.({ ok: 1 }); },
    };
  }
  const user = {
    is: { pub: 'public-key' },
    _: { sea: { priv: 'private-key' } },
    recall() {},
    get(key) { return makeNode([key], true); },
  };
  const gun = {
    get(key) { return makeNode([key], false); },
    user() { return user; },
  };
  function FakeGun() { return gun; }
  const SEA = {
    async decrypt(ciphertext) {
      if (ciphertext === 'outcome-cipher') return JSON.stringify(outcomeMemory);
      return null;
    },
    async encrypt(value) { return `cipher:${value}`; },
  };

  const result = await importLatestMarketPulseCapsules({
    storage,
    GunImpl: FakeGun,
    SEA,
    identity: { readSharedIdentity() { return { signedIn: true }; } },
    timeoutMs: 50,
    profileRetryCount: 0,
  });
  const stored = readMoneyPrinterState(storage);
  const active = stored.experiments.find((item) => item.capsule?.status === 'active');
  const serialized = JSON.stringify(stored);

  assert.equal(result.outcomeLearningApplied, true);
  assert.equal(active.id, 'experiment-market-pulse-audio');
  assert.equal(serialized.includes('venture-outcome-memory-v1'), false);
  assert.equal(serialized.includes('observedAt'), false);
  assert.equal(serialized.includes('freelance audio engineers'), true);
});

test('terminal outcome sync writes encrypted memory from Money Printer state', async () => {
  let storedRecord = null;
  const accountNode = {
    once(callback) { callback(storedRecord); },
    put(value, callback) { storedRecord = value; callback({ ok: 1 }); },
  };
  const user = {
    is: { pub: 'pub' },
    _: { sea: { priv: 'priv' } },
    recall() {},
    get() { return { get() { return accountNode; } }; },
  };
  const gun = { user() { return user; } };
  const SEA = {
    async encrypt(value) { return `cipher:${value}`; },
    async decrypt(value) { return String(value).replace(/^cipher:/, ''); },
  };
  const state = {
    experiments: [{
      id: 'won-exp', status: 'Revenue', name: 'Audio workflow', customer: 'audio freelancers', pain: 'tool fragmentation', offer: 'workflow automation',
      capsule: { status: 'won' }, marketPulse: { sourceOpportunityId: 'audio', sourceRunId: 'run-a' },
    }],
  };

  const result = await syncPrivateVentureOutcomeMemory({
    state,
    gun,
    storage: fakeStorage({ signedIn: 'true' }),
    SEA,
    identity: { readSharedIdentity() { return { signedIn: true }; } },
    timeoutMs: 50,
  });

  assert.equal(result.saved, true);
  assert.ok(storedRecord.ciphertext.startsWith('cipher:'));
  assert.ok(storedRecord.ciphertext.includes('audio'));
});

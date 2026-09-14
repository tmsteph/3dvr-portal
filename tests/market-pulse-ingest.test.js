import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMarketPulseCapsuleCandidates, serializeMarketPulseCapsuleCandidates } from '../src/growth/market-pulse-capsules.js';
import { createDefaultMoneyPrinterState } from '../src/money-printer/moneyPrinterCore.js';
import {
  ingestMarketPulseCapsuleCandidates,
  parseMarketPulseCapsuleRecord,
} from '../src/money-printer/marketPulseIngest.js';
import {
  importLatestMarketPulseCapsules,
  readMoneyPrinterState,
} from '../src/money-printer/moneyPrinterStorage.js';

function samplePulse(runId = 'market-pulse-run-1') {
  return {
    runId,
    generatedAt: '2026-09-14T16:23:00.000Z',
    profile: { searchMode: 'portfolio' },
    opportunities: [
      {
        id: 'high-demand',
        title: 'High demand workflow',
        problem: 'A paid workflow is repeatedly breaking.',
        audience: 'reachable teams',
        solution: 'A small manual-first operating lane.',
        suggestedPrice: '$500 setup',
        score: 95,
        marketScore: 92,
        profitScore: 90,
        alignmentScore: 60,
        fulfillmentScore: 88,
        evidence: ['buyer asks for this repeatedly'],
      },
      {
        id: 'backup-demand',
        title: 'Backup demand workflow',
        problem: 'A second workflow is painful but less urgent.',
        audience: 'reachable operators',
        solution: 'A smaller backup offer.',
        suggestedPrice: '$300 setup',
        score: 85,
        marketScore: 82,
        profitScore: 80,
        alignmentScore: 55,
        fulfillmentScore: 84,
        evidence: ['secondary demand signal'],
      },
    ],
  };
}

function payload(runId = 'market-pulse-run-1') {
  const pulse = samplePulse(runId);
  return {
    runId,
    generatedAt: pulse.generatedAt,
    candidates: buildMarketPulseCapsuleCandidates(pulse),
  };
}

test('Money Printer imports queued Market Pulse candidates and lets the allocator choose active attention', () => {
  const result = ingestMarketPulseCapsuleCandidates(createDefaultMoneyPrinterState(), payload());
  const pulseExperiments = result.state.experiments.filter((item) => item.marketPulse);

  assert.equal(result.imported, 2);
  assert.equal(pulseExperiments.length, 2);
  assert.equal(result.state.experiments.filter((item) => item.capsule?.status === 'active').length, 1);
  assert.equal(result.state.experiments.filter((item) => item.capsule?.status === 'research').length, 1);
  assert.equal(result.state.experiments.find((item) => item.capsule?.status === 'active').id, 'experiment-market-pulse-high-demand');
  assert.ok(result.state.experiments.some((item) => item.capsule?.status === 'queued'));
  assert.ok(pulseExperiments.every((item) => item.capsule.policy.maxAutomatedSpendCents === 0));
  assert.ok(pulseExperiments.every((item) => item.capsule.policy.externalWrites === 'approval-required'));
});

test('re-importing the same Market Pulse run is idempotent', () => {
  const first = ingestMarketPulseCapsuleCandidates(createDefaultMoneyPrinterState(), payload());
  const second = ingestMarketPulseCapsuleCandidates(first.state, payload());

  assert.equal(second.skipped, true);
  assert.equal(second.reason, 'already imported');
  assert.equal(second.imported, 0);
  assert.equal(second.state.experiments.length, first.state.experiments.length);
});

test('later Market Pulse evidence refreshes priority without reviving a killed experiment', () => {
  const first = ingestMarketPulseCapsuleCandidates(createDefaultMoneyPrinterState(), payload('run-1'));
  const targetId = 'experiment-market-pulse-high-demand';
  const killedState = {
    ...first.state,
    experiments: first.state.experiments.map((experiment) => (
      experiment.id === targetId
        ? { ...experiment, status: 'Killed', capsule: { ...experiment.capsule, status: 'killed' } }
        : experiment
    )),
  };
  const nextPayload = payload('run-2');
  nextPayload.candidates[0].capsule.priorityScore = 100;
  const second = ingestMarketPulseCapsuleCandidates(killedState, nextPayload);
  const target = second.state.experiments.find((experiment) => experiment.id === targetId);

  assert.equal(target.status, 'Killed');
  assert.equal(target.capsule.status, 'killed');
});

test('browser storage importer reads the public queue before hydration without requiring account data', async () => {
  const pulse = samplePulse('browser-import-run');
  const record = serializeMarketPulseCapsuleCandidates(pulse);
  const values = new Map();
  const storage = {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
    removeItem(key) { values.delete(key); },
  };
  const node = {
    get() { return this; },
    once(callback) { callback(record); },
  };
  function FakeGun() { return node; }

  const result = await importLatestMarketPulseCapsules({
    storage,
    GunImpl: FakeGun,
    peers: ['wss://relay.example/gun'],
    timeoutMs: 20,
  });
  const stored = readMoneyPrinterState(storage);

  assert.equal(result.imported, 2);
  assert.equal(stored.marketPulseLastImportedRunId, 'browser-import-run');
  assert.equal(stored.experiments.filter((item) => item.marketPulse).length, 2);
});

test('Market Pulse capsule records parse safely when the queue is malformed', () => {
  const parsed = parseMarketPulseCapsuleRecord({ runId: 'bad-run', candidatesJson: '{bad json' });
  assert.equal(parsed.runId, 'bad-run');
  assert.deepEqual(parsed.candidates, []);
});

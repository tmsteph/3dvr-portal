import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildMarketPulseCapsuleCandidates,
  serializeMarketPulseCapsuleCandidates,
} from '../src/growth/market-pulse-capsules.js';
import { runMarketPulseCli } from '../src/growth/market-pulse-runner.js';
import { createDefaultMoneyPrinterState } from '../src/money-printer/moneyPrinterCore.js';
import { ingestMarketPulseCapsuleCandidates } from '../src/money-printer/marketPulseIngest.js';
import { importLatestMarketPulseCapsules, readMoneyPrinterState } from '../src/money-printer/moneyPrinterStorage.js';

function pulse(runId = 'bridge-run') {
  return {
    runId,
    generatedAt: '2099-09-14T16:23:00.000Z',
    profile: { searchMode: 'portfolio', market: 'event teams', keywords: ['event staffing'] },
    signalsAnalyzed: 2,
    approvalsRequired: 0,
    marketFit: { score: 80, verdict: 'strong signal' },
    topOpportunity: { title: 'Event staffing lane', problem: 'Staffing gaps', score: 94 },
    persist: { directoryListingsPublished: 0 },
    socialProbeDrafts: [],
    reactionSnapshots: [],
    warnings: [],
    opportunities: [
      {
        id: 'event-staffing',
        title: 'Event staffing lane',
        problem: 'Last-minute technical staffing gaps',
        audience: 'event teams',
        solution: 'Availability and staffing coordination',
        suggestedPrice: '$300 setup',
        score: 94,
        marketScore: 90,
        profitScore: 88,
        alignmentScore: 60,
        fulfillmentScore: 92,
        evidence: ['buyer demand'],
      },
      {
        id: 'quote-follow-up',
        title: 'Quote follow-up lane',
        problem: 'Warm quotes go cold',
        audience: 'service teams',
        solution: 'Reminder workflow',
        suggestedPrice: '$99/month',
        score: 84,
        evidence: ['secondary demand'],
      },
    ],
  };
}

test('scheduled discoveries enter Money Printer as bounded, approval-gated capsules', () => {
  const source = pulse();
  const candidates = buildMarketPulseCapsuleCandidates(source);
  const result = ingestMarketPulseCapsuleCandidates(createDefaultMoneyPrinterState(), {
    runId: source.runId,
    generatedAt: source.generatedAt,
    candidates,
  });
  const imported = result.state.experiments.filter((item) => item.marketPulse);

  assert.equal(candidates.every((item) => item.capsule.status === 'queued'), true);
  assert.equal(imported.length, 2);
  assert.equal(result.state.experiments.filter((item) => item.capsule?.status === 'active').length, 1);
  assert.equal(result.state.experiments.filter((item) => item.capsule?.status === 'research').length, 1);
  assert.equal(imported.every((item) => item.capsule.policy.maxAutomatedSpendCents === 0), true);
  assert.equal(imported.every((item) => item.capsule.policy.externalWrites === 'approval-required'), true);
});

test('browser storage imports the public queue before normal Money Printer hydration', async () => {
  const source = pulse('browser-bridge-run');
  const record = serializeMarketPulseCapsuleCandidates(source);
  const values = new Map();
  const storage = {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
    removeItem(key) { values.delete(key); },
  };
  const node = { get() { return this; }, once(callback) { callback(record); } };
  function FakeGun() { return node; }

  const result = await importLatestMarketPulseCapsules({ storage, GunImpl: FakeGun, timeoutMs: 20 });
  const stored = readMoneyPrinterState(storage);

  assert.equal(result.imported, 2);
  assert.equal(stored.marketPulseLastImportedRunId, 'browser-bridge-run');
  assert.equal(stored.experiments.filter((item) => item.marketPulse).length, 2);
});

test('Market Pulse runner invokes the capsule queue without making queue failure fatal', async () => {
  const stdout = { value: '', write(chunk) { this.value += chunk; } };
  const stderr = { value: '', write(chunk) { this.value += chunk; } };
  let queueCalls = 0;

  const ok = await runMarketPulseCli({
    argv: ['--market', 'event teams'],
    env: {},
    stdout,
    stderr,
    async runCycleImpl() { return pulse('runner-ok'); },
    async persistCapsulesImpl() {
      queueCalls += 1;
      return { skipped: false, candidatesPublished: 2 };
    },
  });
  assert.equal(ok.exitCode, 0);
  assert.equal(queueCalls, 1);
  assert.equal(ok.summary.capsuleCandidates, 2);

  const degraded = await runMarketPulseCli({
    argv: ['--market', 'event teams'],
    env: {},
    stdout: { write() {} },
    stderr: { write() {} },
    async runCycleImpl() { return pulse('runner-degraded'); },
    async persistCapsulesImpl() { throw new Error('relay offline'); },
  });
  assert.equal(degraded.exitCode, 0);
  assert.equal(degraded.result.capsulePersist.skipped, true);
  assert.ok(degraded.result.warnings.some((warning) => /Venture Capsule queue/.test(warning)));
});

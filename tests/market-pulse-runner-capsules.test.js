import assert from 'node:assert/strict';
import test from 'node:test';
import { runMarketPulseCli } from '../src/growth/market-pulse-runner.js';

function fakeResult(dryRun = false) {
  return {
    runId: 'market-pulse-runner-capsule-test',
    generatedAt: '2026-09-14T16:23:00.000Z',
    dryRun,
    profile: {
      searchMode: 'portfolio',
      market: 'event teams',
      keywords: ['event staffing'],
    },
    signalsAnalyzed: 2,
    approvalsRequired: 0,
    marketFit: { score: 80, verdict: 'strong signal' },
    topOpportunity: {
      title: 'Event staffing lane',
      problem: 'Last-minute staffing gaps',
      score: 90,
      marketScore: 88,
      profitScore: 86,
      alignmentScore: 60,
      fulfillmentScore: 92,
    },
    opportunities: [
      {
        id: 'event-staffing',
        title: 'Event staffing lane',
        problem: 'Last-minute staffing gaps',
        audience: 'event teams',
        solution: 'Availability and staffing coordination',
        suggestedPrice: '$300 setup',
        score: 90,
      },
    ],
    persist: { directoryListingsPublished: 0 },
    socialProbeDrafts: [],
    reactionSnapshots: [],
    warnings: [],
  };
}

test('scheduled Market Pulse calls the capsule persistence bridge after the research cycle', async () => {
  let persistCalls = 0;
  let capturedOptions;
  const stdout = { value: '', write(chunk) { this.value += chunk; } };
  const stderr = { value: '', write(chunk) { this.value += chunk; } };

  const result = await runMarketPulseCli({
    argv: ['--market', 'event teams'],
    env: {},
    stdout,
    stderr,
    async runCycleImpl(options) {
      capturedOptions = options;
      return fakeResult(false);
    },
    async persistCapsulesImpl(pulse, options) {
      persistCalls += 1;
      assert.equal(pulse.runId, 'market-pulse-runner-capsule-test');
      assert.equal(options.market, 'event teams');
      return { skipped: false, candidatesPublished: 1 };
    },
  });

  assert.equal(result.exitCode, 0);
  assert.equal(persistCalls, 1);
  assert.equal(capturedOptions.searchMode, 'portfolio');
  assert.equal(result.summary.capsuleCandidates, 1);
  assert.match(stdout.value, /Queued Venture Capsule candidates: 1/);
  assert.equal(stderr.value, '');
});

test('capsule queue failures warn but do not fail the primary Market Pulse schedule', async () => {
  const stdout = { value: '', write(chunk) { this.value += chunk; } };
  const stderr = { value: '', write(chunk) { this.value += chunk; } };

  const result = await runMarketPulseCli({
    argv: ['--market', 'event teams'],
    env: {},
    stdout,
    stderr,
    async runCycleImpl() { return fakeResult(false); },
    async persistCapsulesImpl() { throw new Error('relay offline'); },
  });

  assert.equal(result.exitCode, 0);
  assert.equal(result.result.capsulePersist.skipped, true);
  assert.match(result.result.capsulePersist.reason, /relay offline/);
  assert.ok(result.result.warnings.some((warning) => /Venture Capsule queue/.test(warning)));
  assert.equal(stderr.value, '');
});

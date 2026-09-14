import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildMarketPulseCapsuleCandidates,
  deserializeMarketPulseCapsuleCandidates,
  persistMarketPulseCapsuleCandidates,
  serializeMarketPulseCapsuleCandidates,
} from '../src/growth/market-pulse-capsules.js';

function pulse() {
  return {
    runId: 'market-pulse-20260914162300',
    generatedAt: '2026-09-14T16:23:00.000Z',
    profile: { searchMode: 'portfolio' },
    opportunities: [
      {
        id: 'av-staffing',
        title: 'AV staffing coordination',
        problem: 'Event teams lose time filling last-minute technical roles.',
        audience: 'event production teams',
        solution: 'A lightweight staffing and availability coordination lane.',
        suggestedPrice: '$300 setup plus $99/month',
        score: 91,
        marketScore: 88,
        profitScore: 84,
        alignmentScore: 72,
        fulfillmentScore: 90,
        evidence: ['reddit: repeated staffing pain', 'https://example.com/thread'],
      },
      {
        id: 'quote-follow-up',
        title: 'Quote follow-up automation',
        problem: 'Local service businesses lose warm quotes after the first estimate.',
        audience: 'local service businesses',
        solution: 'A reminder and quote follow-up workflow.',
        suggestedPrice: '$50/month',
        score: 79,
        marketScore: 81,
        profitScore: 77,
        alignmentScore: 50,
        fulfillmentScore: 82,
        evidence: ['multiple quote follow-up complaints'],
      },
    ],
  };
}

test('Market Pulse turns ranked discoveries into queued, zero-spend Venture Capsule candidates', () => {
  const candidates = buildMarketPulseCapsuleCandidates(pulse());

  assert.equal(candidates.length, 2);
  assert.equal(candidates[0].capsule.status, 'queued');
  assert.equal(candidates[0].capsule.priorityScore, 91);
  assert.equal(candidates[0].capsule.sourceId, 'experiment-market-pulse-av-staffing');
  assert.equal(candidates[0].capsule.budgetCapCents, 0);
  assert.equal(candidates[0].capsule.policy.maxAutomatedSpendCents, 0);
  assert.equal(candidates[0].capsule.policy.externalWrites, 'approval-required');
  assert.equal(candidates[0].capsule.policy.irreversibleActions, 'approval-required');
  assert.equal(candidates[0].capsule.priceCents, 30000);
  assert.equal(candidates[0].sourceRunId, pulse().runId);
});

test('Market Pulse capsule records round-trip through Gun-safe JSON fields', () => {
  const candidates = buildMarketPulseCapsuleCandidates(pulse());
  const record = serializeMarketPulseCapsuleCandidates(pulse(), candidates);
  const restored = deserializeMarketPulseCapsuleCandidates(record);

  assert.equal(record.candidateCount, 2);
  assert.equal(typeof record.candidatesJson, 'string');
  assert.equal(restored.runId, pulse().runId);
  assert.equal(restored.candidates.length, 2);
  assert.equal(restored.candidates[0].capsule.sourceId, 'experiment-market-pulse-av-staffing');
});

test('scheduled capsule persistence writes through the injected queue client and dry runs stay read-only', async () => {
  const writes = [];
  const persisted = await persistMarketPulseCapsuleCandidates(pulse(), {
    capsuleClient: {
      async write(inputPulse, candidates) {
        writes.push({ inputPulse, candidates });
        return { runId: inputPulse.runId, candidatesPublished: candidates.length };
      },
    },
  });

  assert.equal(writes.length, 1);
  assert.equal(persisted.candidatesPublished, 2);
  assert.equal(persisted.skipped, false);

  const dryRun = await persistMarketPulseCapsuleCandidates({ ...pulse(), dryRun: true }, { dryRun: true });
  assert.equal(dryRun.skipped, true);
  assert.equal(dryRun.candidatesPublished, 0);
  assert.equal(dryRun.candidates.length, 2);
});

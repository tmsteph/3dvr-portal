import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createOpportunityCluster,
  sortOpportunityClusters
} from '../src/money-printer/opportunityEngine.js';

const positiveSum = {
  capability: 0.7,
  money: 0.7,
  enjoyment: 0.7
};

test('kernel opportunity score rewards balanced fit, demand, effort, and revenue', () => {
  const balanced = createOpportunityCluster({
    id: 'balanced',
    need: 'Balanced opportunity',
    buyerWords: 'We need this now and have budget for it',
    policyStatus: 'human-provided',
    fitScore: 90,
    demandScore: 90,
    effortScore: 90,
    revenueScore: 90,
    positiveSum
  });

  const lopsided = createOpportunityCluster({
    id: 'lopsided',
    need: 'Lopsided opportunity',
    buyerWords: 'We need this now and have budget for it',
    policyStatus: 'human-provided',
    fitScore: 5,
    demandScore: 100,
    effortScore: 100,
    revenueScore: 100,
    positiveSum
  });

  assert.equal(balanced.opportunityScore, 90);
  assert.ok(balanced.opportunityScore > lopsided.opportunityScore);
  assert.equal(balanced.experimentRecommended, true);
});

test('kernel dimensions influence ranking without bypassing positive-sum policy', () => {
  const strong = createOpportunityCluster({
    id: 'strong',
    status: 'new',
    need: 'Strong opportunity',
    buyerWords: 'A buyer has an urgent, funded need',
    policyStatus: 'human-provided',
    fitScore: 92,
    demandScore: 94,
    effortScore: 88,
    revenueScore: 90,
    positiveSum
  });

  const weak = createOpportunityCluster({
    id: 'weak',
    status: 'new',
    need: 'Weak opportunity',
    buyerWords: 'A buyer may have a need',
    policyStatus: 'human-provided',
    fitScore: 35,
    demandScore: 40,
    effortScore: 35,
    revenueScore: 30,
    positiveSum
  });

  const disallowed = createOpportunityCluster({
    id: 'disallowed',
    status: 'new',
    need: 'Economically tempting but exploitative',
    buyerWords: 'There is clear demand',
    policyStatus: 'human-provided',
    fitScore: 100,
    demandScore: 100,
    effortScore: 100,
    revenueScore: 100,
    positiveSum: {
      capability: 0.9,
      money: 0.9,
      enjoyment: 0.9,
      exploitation: 1
    }
  });

  const sorted = sortOpportunityClusters([weak, disallowed, strong]);

  assert.equal(sorted[0].id, 'strong');
  assert.ok(strong.priorityScore > weak.priorityScore);
  assert.equal(disallowed.positiveSumEligible, false);
  assert.equal(disallowed.priorityScore, 0);
  assert.equal(disallowed.experimentRecommended, false);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createPossibilitySearchPlan,
  promoteOpportunityToPossibilityExperiments
} from '../src/money-printer/possibilitySearch.js';
import { allocateVentureCapsules, normalizeVentureCapsule } from '../src/money-printer/ventureCapsules.js';

function opportunity(overrides = {}) {
  return {
    id: 'opportunity-av-followup',
    title: 'Same-day AV follow-up service',
    searchMode: 'portfolio',
    priorityScore: 82,
    demandScore: 86,
    revenueScore: 78,
    effortScore: 72,
    profitScore: 78,
    fulfillmentScore: 72,
    positiveSumEligible: true,
    experimentRecommended: true,
    signals: [{
      id: 'signal-1',
      need: 'Fast AV follow-up',
      buyerWords: 'We lose leads after events because follow-up is too slow.',
      confidence: 70,
      estimatedCostMax: 75,
      skills: ['AV', 'automation']
    }],
    ...overrides
  };
}

test('possibility search expands one opportunity into a bounded 81-variant search space', () => {
  const plan = createPossibilitySearchPlan(opportunity());
  assert.equal(plan.searchSpaceSize, 81);
  assert.equal(plan.portfolio.exploit.length, 1);
  assert.equal(plan.portfolio.explore.length, 1);
  assert.ok(plan.portfolio.explore[0].noveltyScore > 0);
  assert.notEqual(plan.portfolio.exploit[0].id, plan.portfolio.explore[0].id);
});

test('promotion emits exploit and exploration experiments without granting external authority', () => {
  const experiments = promoteOpportunityToPossibilityExperiments(opportunity(), {
    now: new Date('2026-09-15T16:00:00Z')
  });
  assert.equal(experiments.length, 2);
  assert.deepEqual(new Set(experiments.map(item => item.capsule.search.role)), new Set(['exploit', 'explore']));
  experiments.forEach(experiment => {
    assert.equal(experiment.capsule.budgetCapCents, 0);
    assert.equal(experiment.capsule.policy.maxAutomatedSpendCents, 0);
    assert.equal(experiment.capsule.policy.externalWrites, 'approval-required');
    assert.equal(experiment.capsule.policy.irreversibleActions, 'approval-required');
  });
});

test('positive-sum failures cannot enter possibility execution', () => {
  const blocked = opportunity({ positiveSumEligible: false, experimentRecommended: false });
  const plan = createPossibilitySearchPlan(blocked);
  assert.equal(plan.portfolio.exploit.length, 0);
  assert.equal(plan.portfolio.explore.length, 0);
  assert.deepEqual(promoteOpportunityToPossibilityExperiments(blocked), []);
});

test('venture allocation reserves research attention for an explicit high-learning explore variant', () => {
  const now = new Date('2026-09-15T16:00:00Z');
  const exploit = normalizeVentureCapsule({
    id: 'capsule-exploit', sourceId: 'experiment-exploit', priorityScore: 90,
    search: {
      parentOpportunityId: 'opportunity-1', candidateId: 'candidate-exploit', variantKey: 'baseline',
      hypothesis: 'Exploit the strongest expected path.', role: 'exploit', expectedValueScore: 90,
      learningScore: 40, noveltyScore: 0, searchScore: 88
    }
  }, now);
  const familiarRunnerUp = normalizeVentureCapsule({
    id: 'capsule-runner-up', sourceId: 'experiment-runner-up', priorityScore: 88
  }, now);
  const explore = normalizeVentureCapsule({
    id: 'capsule-explore', sourceId: 'experiment-explore', priorityScore: 62,
    search: {
      parentOpportunityId: 'opportunity-1', candidateId: 'candidate-explore', variantKey: 'partner|premium',
      hypothesis: 'Explore a different path.', role: 'explore', expectedValueScore: 62,
      learningScore: 98, noveltyScore: 100, searchScore: 76
    }
  }, now);
  const portfolio = allocateVentureCapsules([familiarRunnerUp, explore, exploit], {}, now);
  assert.equal(portfolio.active[0].id, 'capsule-exploit');
  assert.equal(portfolio.research[0].id, 'capsule-explore');
  assert.equal(portfolio.queued[0].id, 'capsule-runner-up');
});

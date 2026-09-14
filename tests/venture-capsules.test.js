import assert from 'node:assert/strict';
import test from 'node:test';
import {
  allocateVentureCapsules,
  capsuleCanAutoExecute,
  createVentureCapsuleFromIdea
} from '../src/money-printer/ventureCapsules.js';
import {
  promoteIdeaToExperiment,
  summarizePortfolio
} from '../src/money-printer/moneyPrinterExperiments.js';

function idea(id, score) {
  return {
    id,
    business_name: `Business ${id}`,
    target_customer: 'reachable buyers',
    customer_pain: 'A specific painful workflow',
    offer: 'A small paid outcome',
    revenue_path: '$300 setup, then $99/month',
    first_test_this_week: 'Ask 10 buyers for a paid pilot.',
    tools_needed: ['Market Research Bot'],
    total_score: score
  };
}

test('venture allocation keeps discovery unlimited while bounding active execution', () => {
  const now = new Date('2026-09-14T20:00:00Z');
  const capsules = [92, 84, 76, 68, 60].map((score, index) => createVentureCapsuleFromIdea(
    idea(`idea-${index + 1}`, score),
    { now }
  ));
  const portfolio = allocateVentureCapsules(capsules, {}, now);

  assert.equal(portfolio.capsules.length, 5);
  assert.equal(portfolio.active.length, 1);
  assert.equal(portfolio.research.length, 1);
  assert.equal(portfolio.queued.length, 3);
  assert.equal(portfolio.active[0].priorityScore, 92);
  assert.equal(portfolio.research[0].priorityScore, 84);
});

test('capsules never authorize external writes or spend by default', () => {
  const capsule = {
    ...createVentureCapsuleFromIdea(idea('safe', 90), { now: new Date('2026-09-14T20:00:00Z') }),
    status: 'active'
  };

  assert.equal(capsuleCanAutoExecute(capsule, { type: 'workspace_write', spendCents: 0 }), true);
  assert.equal(capsuleCanAutoExecute(capsule, { type: 'external_write', spendCents: 0 }), false);
  assert.equal(capsuleCanAutoExecute(capsule, { type: 'workspace_write', spendCents: 1 }), false);
  assert.equal(capsuleCanAutoExecute({ ...capsule, status: 'research' }, { type: 'workspace_write' }), false);
});

test('promoted Money Printer ideas carry disposable capsule bounds into portfolio summaries', () => {
  const experiments = [
    promoteIdeaToExperiment(idea('high', 90)),
    promoteIdeaToExperiment(idea('middle', 75)),
    promoteIdeaToExperiment(idea('low', 60))
  ];
  const summary = summarizePortfolio(experiments);

  assert.ok(experiments.every((experiment) => experiment.capsule?.expiresAt));
  assert.equal(summary.activeCapsules, 1);
  assert.equal(summary.researchCapsules, 1);
  assert.equal(summary.queuedCapsules, 1);
  assert.match(summary.attentionRule, /At most 1 active capsule and 1 research capsule/i);
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  OPPORTUNITY_ENGINE_SCHEMA_VERSION,
  createOpportunityCluster,
  sortOpportunityClusters
} from '../src/money-printer/opportunityEngine.js';

const NOW = new Date('2026-09-14T20:00:00.000Z');

describe('Opportunity Engine positive-sum gate', () => {
  it('persists positive-sum policy dimensions in schema v4 records', () => {
    const opportunity = createOpportunityCluster({
      id: 'healthy',
      need: 'Automate repetitive scheduling',
      buyerWords: 'We spend hours every week coordinating schedules.',
      urgency: 'high',
      confidence: 85,
      policyStatus: 'human-provided',
      estimatedValueMin: 500,
      estimatedCostMax: 100,
      agencyScore: 80,
      sharedValueScore: 85,
      opennessScore: 70,
      harmRiskScore: 5,
      lockInRiskScore: 10
    }, NOW);

    assert.equal(OPPORTUNITY_ENGINE_SCHEMA_VERSION, 4);
    assert.equal(opportunity.schemaVersion, 4);
    assert.equal(opportunity.positiveSumEligible, true);
    assert.equal(opportunity.agencyScore, 80);
    assert.ok(opportunity.positiveSumScore > 0);
    assert.ok(opportunity.priorityScore > 0);
  });

  it('retains economics but removes executable priority for blocked opportunities', () => {
    const blocked = createOpportunityCluster({
      id: 'blocked',
      need: 'High-margin harmful tactic',
      buyerWords: 'There is strong demand and budget for this tactic.',
      urgency: 'immediate',
      confidence: 95,
      policyStatus: 'human-provided',
      estimatedValueMin: 5000,
      estimatedCostMax: 100,
      profitScore: 100,
      harmRiskScore: 95
    }, NOW);

    assert.equal(blocked.positiveSumEligible, false);
    assert.ok(blocked.economicPriorityScore > 0);
    assert.equal(blocked.priorityScore, 0);
    assert.ok(blocked.blockedReasons.includes('harm-risk'));
  });

  it('sorts eligible opportunities ahead of blocked opportunities', () => {
    const healthy = {
      id: 'healthy',
      need: 'Healthy service',
      buyerWords: 'We need this service this week.',
      urgency: 'medium',
      confidence: 60,
      policyStatus: 'human-provided',
      estimatedValueMin: 200,
      estimatedCostMax: 100,
      agencyScore: 80,
      sharedValueScore: 80
    };
    const blocked = {
      id: 'blocked',
      need: 'Blocked service',
      buyerWords: 'We will pay a lot for this immediately.',
      urgency: 'immediate',
      confidence: 100,
      policyStatus: 'human-provided',
      estimatedValueMin: 10000,
      estimatedCostMax: 1,
      profitScore: 100,
      harmRiskScore: 100
    };

    assert.deepEqual(sortOpportunityClusters([blocked, healthy], NOW).map(item => item.id), ['healthy', 'blocked']);
  });
});

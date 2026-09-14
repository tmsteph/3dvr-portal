import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  POSITIVE_SUM_KERNEL_VERSION,
  POSITIVE_SUM_LOOP,
  evaluatePositiveSum
} from '../src/kernel/positiveSum.js';
import { rankOpportunities, scoreOpportunity } from '../src/money/scoring.js';

describe('Positive-sum kernel', () => {
  it('exports the canonical movement loop', () => {
    assert.equal(POSITIVE_SUM_KERNEL_VERSION, 1);
    assert.deepEqual(POSITIVE_SUM_LOOP, [
      'state',
      'purpose',
      'opportunity',
      'build',
      'earn',
      'share',
      'community',
      'open-source',
      'repeat'
    ]);
  });

  it('blocks explicit high-harm opportunities', () => {
    const policy = evaluatePositiveSum({
      agencyScore: 70,
      sharedValueScore: 70,
      harmRiskScore: 90
    });

    assert.equal(policy.positiveSumEligible, false);
    assert.ok(policy.blockedReasons.includes('harm-risk'));
  });

  it('keeps economic value visible while preventing blocked work from ranking', () => {
    const blocked = scoreOpportunity({
      id: 'blocked',
      title: 'Extractive growth hack',
      painScore: 95,
      willingnessToPay: 95,
      speedToBuild: 95,
      competitionGap: 95,
      profitScore: 99,
      harmRiskScore: 95
    }, undefined, 'profit');

    assert.ok(blocked.economicScore > 0);
    assert.equal(blocked.score, 0);
    assert.equal(blocked.positiveSumEligible, false);
  });

  it('allows useful profit-first work when the guardrails are healthy', () => {
    const useful = scoreOpportunity({
      id: 'useful',
      title: 'Useful automation service',
      painScore: 80,
      willingnessToPay: 80,
      speedToBuild: 75,
      competitionGap: 65,
      profitScore: 85,
      agencyScore: 75,
      sharedValueScore: 80,
      harmRiskScore: 5,
      lockInRiskScore: 10
    }, undefined, 'profit');

    assert.equal(useful.positiveSumEligible, true);
    assert.ok(useful.score > 0);
  });

  it('ranks eligible work ahead of a more profitable blocked opportunity', () => {
    const ranked = rankOpportunities([
      {
        id: 'blocked',
        title: 'Blocked',
        painScore: 100,
        willingnessToPay: 100,
        speedToBuild: 100,
        competitionGap: 100,
        profitScore: 100,
        harmRiskScore: 100
      },
      {
        id: 'healthy',
        title: 'Healthy',
        painScore: 65,
        willingnessToPay: 65,
        speedToBuild: 65,
        competitionGap: 65,
        profitScore: 65,
        agencyScore: 80,
        sharedValueScore: 80,
        harmRiskScore: 0
      }
    ], undefined, 'profit');

    assert.equal(ranked[0].id, 'healthy');
    assert.equal(ranked[1].id, 'blocked');
  });
});

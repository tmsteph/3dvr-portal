import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBoringMoneyLane,
  scoreBoringMoneyOpportunity
} from '../src/money/boringMoneyLane.js';

test('boring money score rewards painful, payable, fast-to-deliver work', () => {
  const boring = scoreBoringMoneyOpportunity({
    painScore: 92,
    willingnessToPay: 88,
    speedToBuild: 95,
    competitionGap: 45
  });
  const cleverButSlow = scoreBoringMoneyOpportunity({
    painScore: 65,
    willingnessToPay: 55,
    speedToBuild: 20,
    competitionGap: 95
  });

  assert.ok(boring > cleverButSlow);
  assert.ok(boring >= 80);
});

test('boring money lane creates a bounded paid-pilot package', () => {
  const lane = buildBoringMoneyLane([
    {
      id: 'website-fix',
      title: 'Fix broken small-business lead forms',
      problem: 'Local businesses are losing qualified inquiries because their forms fail.',
      audience: 'small businesses with active websites',
      solution: 'Audit and repair the lead form, analytics, and notification path.',
      mvp: 'One-site audit and repair delivered manually in one day.',
      suggestedPrice: '$250 pilot',
      painScore: 90,
      willingnessToPay: 82,
      speedToBuild: 93,
      competitionGap: 60,
      evidence: ['Buyer says leads are being lost now.']
    }
  ], { channels: ['email', 'linkedin'] });

  assert.equal(lane.status, 'ready-for-bounded-test');
  assert.equal(lane.candidate.id, 'website-fix');
  assert.equal(lane.outreach.sendAutomatically, false);
  assert.equal(lane.outreach.permission, 'approval-required');
  assert.equal(lane.experiment.maxAutomaticSpendUsd, 0);
  assert.deepEqual(lane.experiment.requiresApproval, ['publish', 'external-contact', 'spend']);
  assert.match(lane.landingPage.cta, /paid pilot/i);
});

test('boring money lane stays in research when demand or delivery speed is weak', () => {
  const lane = buildBoringMoneyLane([
    {
      title: 'Interesting speculative tool',
      problem: 'A possible future workflow issue.',
      audience: 'early adopters',
      solution: 'Build a novel platform.',
      painScore: 40,
      willingnessToPay: 35,
      speedToBuild: 30,
      competitionGap: 90
    }
  ]);

  assert.equal(lane.status, 'research');
  assert.equal(lane.maxAutomaticSpendUsd, 0);
});

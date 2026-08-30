'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  assessPromotion,
  effectiveLevel,
  evaluateAction,
  recommendedDemotion,
} = require('../thomas-agent/node/autonomy-policy');

test('missing policy fails closed', () => {
  assert.deepEqual(evaluateAction(null, { action: 'read', scopeSatisfied: true }), {
    allowed: false,
    reason: 'missing-or-disabled-policy',
    effectiveLevel: 0,
  });
});

test('critical capabilities are capped at approval level', () => {
  assert.equal(effectiveLevel({ enabled: true, level: 5, risk: 'critical' }), 3);
});

test('level 3 requires explicit approval before execution', () => {
  const policy = { enabled: true, level: 3, risk: 'medium' };
  assert.equal(evaluateAction(policy, {
    action: 'execute',
    scopeSatisfied: true,
  }).reason, 'approval-required');
  assert.equal(evaluateAction(policy, {
    action: 'execute',
    scopeSatisfied: true,
    approved: true,
  }).allowed, true);
});

test('level 4 automatic execution requires audit readiness', () => {
  const policy = { enabled: true, level: 4, risk: 'medium' };
  assert.equal(evaluateAction(policy, {
    action: 'auto_execute',
    scopeSatisfied: true,
  }).reason, 'audit-required');
  assert.equal(evaluateAction(policy, {
    action: 'auto_execute',
    scopeSatisfied: true,
    auditReady: true,
  }).allowed, true);
});

test('level 5 requires bounded, monitored and reversible work', () => {
  const policy = { enabled: true, level: 5, risk: 'low' };
  assert.equal(evaluateAction(policy, {
    action: 'autonomous',
    scopeSatisfied: true,
    auditReady: true,
    bounded: true,
    monitored: true,
    reversible: false,
  }).reason, 'reversibility-required');
  assert.equal(evaluateAction(policy, {
    action: 'autonomous',
    scopeSatisfied: true,
    auditReady: true,
    bounded: true,
    monitored: true,
    reversible: true,
  }).allowed, true);
});

test('promotion is earned one rung at a time', () => {
  const policy = { enabled: true, level: 2, risk: 'medium' };
  const result = assessPromotion(policy, {
    successfulRuns: 12,
    reviewedRuns: 8,
    totalRuns: 12,
    failedRuns: 0,
    rollbacks: 0,
    unsafeAttempts: 0,
  });
  assert.equal(result.eligible, true);
  assert.equal(result.targetLevel, 3);
});

test('unsafe attempts block promotion and severe incidents reset trust', () => {
  const policy = { enabled: true, level: 4, risk: 'medium' };
  assert.equal(assessPromotion(policy, {
    successfulRuns: 200,
    reviewedRuns: 100,
    totalRuns: 200,
    unsafeAttempts: 1,
  }).reason, 'unsafe-attempts-present');
  assert.equal(recommendedDemotion(policy, { policyViolation: true }), 0);
});

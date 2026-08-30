'use strict';

const AUTONOMY_LEVELS = Object.freeze([
  Object.freeze({ id: 0, key: 'observe', label: 'Observe' }),
  Object.freeze({ id: 1, key: 'suggest', label: 'Suggest' }),
  Object.freeze({ id: 2, key: 'draft', label: 'Draft' }),
  Object.freeze({ id: 3, key: 'approval', label: 'Act with approval' }),
  Object.freeze({ id: 4, key: 'audit', label: 'Act + audit' }),
  Object.freeze({ id: 5, key: 'autonomous', label: 'Fully autonomous' }),
]);

const RISK_LEVEL_CAPS = Object.freeze({
  low: 5,
  medium: 5,
  high: 4,
  critical: 3,
});

const DEFAULT_PROMOTION_GATES = Object.freeze({
  1: Object.freeze({ successfulRuns: 1, reviewedRuns: 1, maxFailureRate: 0.25, maxRollbackRate: 0.25 }),
  2: Object.freeze({ successfulRuns: 5, reviewedRuns: 3, maxFailureRate: 0.15, maxRollbackRate: 0.10 }),
  3: Object.freeze({ successfulRuns: 10, reviewedRuns: 5, maxFailureRate: 0.05, maxRollbackRate: 0.05 }),
  4: Object.freeze({ successfulRuns: 25, reviewedRuns: 10, maxFailureRate: 0.02, maxRollbackRate: 0.02 }),
  5: Object.freeze({ successfulRuns: 100, reviewedRuns: 25, maxFailureRate: 0.01, maxRollbackRate: 0.01 }),
});

function clampLevel(value) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(5, parsed));
}

function normalizeRisk(value) {
  const risk = String(value || 'critical').trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(RISK_LEVEL_CAPS, risk) ? risk : 'critical';
}

function riskCap(risk) {
  return RISK_LEVEL_CAPS[normalizeRisk(risk)];
}

function effectiveLevel(policy = {}) {
  if (!policy || policy.enabled !== true) return 0;
  return Math.min(clampLevel(policy.level), riskCap(policy.risk));
}

function actionMinimumLevel(action) {
  const normalized = String(action || '').trim().toLowerCase();
  const map = {
    observe: 0,
    read: 0,
    suggest: 1,
    recommend: 1,
    draft: 2,
    prepare: 2,
    execute: 3,
    act: 3,
    auto_execute: 4,
    'auto-execute': 4,
    autonomous: 5,
  };
  return Object.prototype.hasOwnProperty.call(map, normalized) ? map[normalized] : 5;
}

function evaluateAction(policy, request = {}) {
  if (!policy || policy.enabled !== true) {
    return { allowed: false, reason: 'missing-or-disabled-policy', effectiveLevel: 0 };
  }

  const requiredLevel = request.requiredLevel == null
    ? actionMinimumLevel(request.action)
    : clampLevel(request.requiredLevel);
  const level = effectiveLevel(policy);

  if (request.scopeSatisfied !== true) {
    return { allowed: false, reason: 'scope-not-satisfied', effectiveLevel: level, requiredLevel };
  }
  if (level < requiredLevel) {
    return { allowed: false, reason: 'insufficient-autonomy', effectiveLevel: level, requiredLevel };
  }
  if (requiredLevel >= 3 && level === 3 && request.approved !== true) {
    return { allowed: false, reason: 'approval-required', effectiveLevel: level, requiredLevel };
  }
  if (requiredLevel >= 4 && request.auditReady !== true) {
    return { allowed: false, reason: 'audit-required', effectiveLevel: level, requiredLevel };
  }
  if (requiredLevel >= 5) {
    if (request.bounded !== true) {
      return { allowed: false, reason: 'bounded-scope-required', effectiveLevel: level, requiredLevel };
    }
    if (request.monitored !== true) {
      return { allowed: false, reason: 'monitoring-required', effectiveLevel: level, requiredLevel };
    }
    if (request.reversible !== true) {
      return { allowed: false, reason: 'reversibility-required', effectiveLevel: level, requiredLevel };
    }
  }

  return { allowed: true, reason: 'allowed', effectiveLevel: level, requiredLevel };
}

function rate(numerator, denominator) {
  const num = Number(numerator || 0);
  const den = Number(denominator || 0);
  if (!Number.isFinite(num) || !Number.isFinite(den) || den <= 0) return 0;
  return Math.max(0, num / den);
}

function assessPromotion(policy = {}, evidence = {}, options = {}) {
  const currentLevel = effectiveLevel(policy);
  const requestedTarget = options.targetLevel == null ? currentLevel + 1 : clampLevel(options.targetLevel);
  const targetLevel = Math.min(requestedTarget, riskCap(policy.risk));

  if (targetLevel <= currentLevel) {
    return { eligible: false, reason: 'target-not-higher', currentLevel, targetLevel };
  }
  if (targetLevel !== currentLevel + 1) {
    return { eligible: false, reason: 'one-level-at-a-time', currentLevel, targetLevel };
  }
  if (Number(evidence.unsafeAttempts || 0) > 0) {
    return { eligible: false, reason: 'unsafe-attempts-present', currentLevel, targetLevel };
  }

  const gates = (options.gates && options.gates[targetLevel]) || DEFAULT_PROMOTION_GATES[targetLevel];
  if (!gates) {
    return { eligible: false, reason: 'no-promotion-gate', currentLevel, targetLevel };
  }

  const successfulRuns = Number(evidence.successfulRuns || 0);
  const reviewedRuns = Number(evidence.reviewedRuns || 0);
  const totalRuns = Number(evidence.totalRuns || successfulRuns || 0);
  const failureRate = rate(evidence.failedRuns, totalRuns);
  const rollbackRate = rate(evidence.rollbacks, totalRuns);

  if (successfulRuns < gates.successfulRuns) {
    return { eligible: false, reason: 'not-enough-successful-runs', currentLevel, targetLevel };
  }
  if (reviewedRuns < gates.reviewedRuns) {
    return { eligible: false, reason: 'not-enough-reviewed-runs', currentLevel, targetLevel };
  }
  if (failureRate > gates.maxFailureRate) {
    return { eligible: false, reason: 'failure-rate-too-high', currentLevel, targetLevel };
  }
  if (rollbackRate > gates.maxRollbackRate) {
    return { eligible: false, reason: 'rollback-rate-too-high', currentLevel, targetLevel };
  }
  if (targetLevel === 5 && evidence.explicitOwnerApproval !== true) {
    return { eligible: false, reason: 'owner-approval-required', currentLevel, targetLevel };
  }

  return {
    eligible: true,
    reason: 'promotion-gates-passed',
    currentLevel,
    targetLevel,
    evidence: { successfulRuns, reviewedRuns, totalRuns, failureRate, rollbackRate },
  };
}

function recommendedDemotion(policy = {}, incident = {}) {
  const currentLevel = effectiveLevel(policy);
  if (incident.policyViolation === true || incident.unsafeAttempt === true) return 0;
  if (incident.unboundedAction === true || incident.auditMissing === true) return Math.min(currentLevel, 2);
  if (incident.rollbackRequired === true || incident.userRejectedExecution === true) return Math.max(0, currentLevel - 1);
  return currentLevel;
}

module.exports = {
  AUTONOMY_LEVELS,
  DEFAULT_PROMOTION_GATES,
  RISK_LEVEL_CAPS,
  actionMinimumLevel,
  assessPromotion,
  clampLevel,
  effectiveLevel,
  evaluateAction,
  normalizeRisk,
  recommendedDemotion,
  riskCap,
};

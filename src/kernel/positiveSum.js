export const POSITIVE_SUM_KERNEL_VERSION = 1;

export const POSITIVE_SUM_LOOP = Object.freeze([
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

export const POSITIVE_SUM_INVARIANTS = Object.freeze([
  'Increase human agency rather than dependence.',
  'Prefer voluntary, informed participation over coercion or dark patterns.',
  'Create durable value for participants, not only value extraction for the operator.',
  'Preserve portability, interoperability, and exit paths where practical.',
  'Keep sensitive actions inside explicit permission, risk, and approval boundaries.',
  'Return reusable knowledge, standards, or code to the commons when doing so is safe and sustainable.'
]);

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampScore(value, fallback = 50) {
  return Math.min(100, Math.max(0, Math.round(number(value, fallback))));
}

export function evaluatePositiveSum(input = {}) {
  const agencyScore = clampScore(input.agencyScore, 50);
  const sharedValueScore = clampScore(input.sharedValueScore, 50);
  const opennessScore = clampScore(input.opennessScore, 50);
  const harmRiskScore = clampScore(input.harmRiskScore, 0);
  const lockInRiskScore = clampScore(input.lockInRiskScore, 0);

  const positiveSumScore = clampScore(
    agencyScore * 0.35
      + sharedValueScore * 0.35
      + opennessScore * 0.15
      + (100 - harmRiskScore) * 0.1
      + (100 - lockInRiskScore) * 0.05,
    50
  );

  const blockedReasons = [];
  if (harmRiskScore >= 80) blockedReasons.push('harm-risk');
  if (agencyScore <= 20) blockedReasons.push('agency-loss');
  if (lockInRiskScore >= 95) blockedReasons.push('extreme-lock-in');

  return {
    kernelPolicyVersion: POSITIVE_SUM_KERNEL_VERSION,
    agencyScore,
    sharedValueScore,
    opennessScore,
    harmRiskScore,
    lockInRiskScore,
    positiveSumScore,
    positiveSumEligible: blockedReasons.length === 0,
    blockedReasons
  };
}

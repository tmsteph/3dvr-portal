import {
  normalizeAlignmentProfile,
  scoreOpportunityAlignment,
} from '../kernel/alignmentProfile.js';
import { normalizeOpportunitySearchMode } from '../money/scoring.js';

const ALIGNMENT_WEIGHTS = Object.freeze({
  aligned: 0.35,
  profit: 0.05,
  portfolio: 0.15,
});

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampScore(value, fallback = 50) {
  const parsed = numeric(value, fallback);
  return Math.max(0, Math.min(100, Math.round(parsed * 10) / 10));
}

function candidateOpportunity(candidate = {}) {
  return {
    title: candidate.title,
    problem: candidate.pain,
    audience: candidate.buyer,
    solution: candidate.offer,
    mvp: candidate.offer,
  };
}

export function alignmentPersonalizationKey(profile = {}) {
  const normalized = normalizeAlignmentProfile(profile);
  if (!normalized.keywords.length) return '';
  return [
    `v${normalized.schemaVersion}`,
    normalized.source || 'private',
    normalized.updatedAt || 'undated',
  ].join(':');
}

export function personalizeMarketPulseCandidate(candidate = {}, profile = {}) {
  const normalizedProfile = normalizeAlignmentProfile(profile);
  if (!normalizedProfile.keywords.length) return candidate;

  const mode = normalizeOpportunitySearchMode(candidate.capsule?.mode || 'portfolio');
  const publicAlignmentScore = clampScore(candidate.alignmentScore, 50);
  const alignmentScore = scoreOpportunityAlignment(candidateOpportunity(candidate), normalizedProfile);
  const basePriority = clampScore(candidate.capsule?.priorityScore, 0);
  const adjustment = (alignmentScore - publicAlignmentScore) * ALIGNMENT_WEIGHTS[mode];
  const priorityScore = basePriority <= 0
    ? 0
    : clampScore(basePriority + adjustment, basePriority);

  return {
    ...candidate,
    publicAlignmentScore,
    alignmentScore,
    alignmentProfileSource: normalizedProfile.source,
    capsule: {
      ...(candidate.capsule || {}),
      priorityScore,
    },
  };
}

export function personalizeMarketPulseCapsulePayload(payload = {}, profile = {}) {
  const normalizedProfile = normalizeAlignmentProfile(profile);
  const personalizationKey = alignmentPersonalizationKey(normalizedProfile);
  if (!personalizationKey) {
    return {
      ...payload,
      personalizationKey: '',
      candidates: Array.isArray(payload.candidates) ? payload.candidates : [],
    };
  }

  return {
    ...payload,
    personalizationKey,
    candidates: (Array.isArray(payload.candidates) ? payload.candidates : [])
      .map((candidate) => personalizeMarketPulseCandidate(candidate, normalizedProfile)),
  };
}

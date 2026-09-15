import {
  normalizeAlignmentProfile,
  scoreOpportunityAlignment,
} from '../kernel/alignmentProfile.js';
import { normalizeOpportunitySearchMode } from '../money/scoring.js';
import {
  normalizeVentureOutcomeMemory,
  scoreVentureOutcomeMemory,
  ventureOutcomeMemoryKey,
} from './ventureOutcomeMemory.js';

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

export function privatePersonalizationKey(profile = {}, outcomeMemory = {}) {
  const parts = [
    alignmentPersonalizationKey(profile),
    ventureOutcomeMemoryKey(outcomeMemory),
  ].filter(Boolean);
  return parts.join('|');
}

export function personalizeMarketPulseCandidate(candidate = {}, profile = {}, outcomeMemory = {}) {
  const normalizedProfile = normalizeAlignmentProfile(profile);
  const normalizedMemory = normalizeVentureOutcomeMemory(outcomeMemory);
  const hasAlignment = normalizedProfile.keywords.length > 0;
  const hasOutcomeMemory = normalizedMemory.entries.length > 0;
  if (!hasAlignment && !hasOutcomeMemory) return candidate;

  const mode = normalizeOpportunitySearchMode(candidate.capsule?.mode || 'portfolio');
  const publicAlignmentScore = clampScore(candidate.alignmentScore, 50);
  const alignmentScore = hasAlignment
    ? scoreOpportunityAlignment(candidateOpportunity(candidate), normalizedProfile)
    : publicAlignmentScore;
  const basePriority = clampScore(candidate.capsule?.priorityScore, 0);
  const alignmentAdjustment = hasAlignment
    ? (alignmentScore - publicAlignmentScore) * ALIGNMENT_WEIGHTS[mode]
    : 0;
  const outcomeLearning = hasOutcomeMemory
    ? scoreVentureOutcomeMemory(candidate, normalizedMemory)
    : { adjustment: 0, matches: 0 };
  const priorityScore = basePriority <= 0
    ? 0
    : clampScore(basePriority + alignmentAdjustment + outcomeLearning.adjustment, basePriority);

  return {
    ...candidate,
    ...(hasAlignment ? {
      publicAlignmentScore,
      alignmentScore,
      alignmentProfileSource: normalizedProfile.source,
    } : {}),
    ...(hasOutcomeMemory ? {
      outcomeLearningAdjustment: outcomeLearning.adjustment,
      outcomeLearningMatches: outcomeLearning.matches,
    } : {}),
    capsule: {
      ...(candidate.capsule || {}),
      priorityScore,
    },
  };
}

export function personalizeMarketPulseCapsulePayload(payload = {}, profile = {}, outcomeMemory = {}) {
  const normalizedProfile = normalizeAlignmentProfile(profile);
  const normalizedMemory = normalizeVentureOutcomeMemory(outcomeMemory);
  const personalizationKey = privatePersonalizationKey(normalizedProfile, normalizedMemory);
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
      .map((candidate) => personalizeMarketPulseCandidate(candidate, normalizedProfile, normalizedMemory)),
  };
}

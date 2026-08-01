// Browser- and Node-safe Opportunity Engine records.
// External source connectors may add DemandSignals later, but every signal must
// retain its provenance and policy state before it can become actionable.

export const OPPORTUNITY_ENGINE_SCHEMA_VERSION = 1;
export const OPPORTUNITY_ENGINE_STORAGE_KEY = '3dvr.money-printer.opportunity-engine.v1';

const URGENCY_WEIGHTS = {
  immediate: 30,
  high: 24,
  medium: 14,
  low: 6
};

function text(value, fallback = '') {
  return String(value ?? fallback).trim();
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function list(value) {
  if (Array.isArray(value)) return value.map(item => text(item)).filter(Boolean);
  return text(value)
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function timestamp(value, fallback = new Date().toISOString()) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : fallback;
}

function makeId(prefix = 'record') {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeFingerprintPart(value) {
  return text(value).toLowerCase().replace(/\s+/g, ' ');
}

export function opportunitySignalFingerprint(input = {}) {
  const explicitId = normalizeFingerprintPart(input.externalId || input.sourceId);
  if (explicitId) {
    return [normalizeFingerprintPart(input.acquisitionMode), explicitId].join(':');
  }
  return [
    normalizeFingerprintPart(input.sourceLabel || input.source),
    normalizeFingerprintPart(input.buyerWords || input.evidence),
    normalizeFingerprintPart(input.need)
  ].join('|');
}

export function createDemandSignal(input = {}, now = new Date()) {
  const createdAt = timestamp(input.createdAt, now.toISOString());
  return {
    schemaVersion: OPPORTUNITY_ENGINE_SCHEMA_VERSION,
    id: text(input.id) || makeId('signal'),
    need: text(input.need, 'Unspecified need'),
    buyerWords: text(input.buyerWords || input.evidence),
    sourceLabel: text(input.sourceLabel || input.source, 'Manual forward'),
    sourceUrl: text(input.sourceUrl),
    externalId: text(input.externalId || input.sourceId),
    sourceFingerprint: text(input.sourceFingerprint) || opportunitySignalFingerprint(input),
    acquisitionMode: text(input.acquisitionMode, 'manual-forward'),
    policyStatus: text(input.policyStatus, 'human-provided'),
    contactPermission: text(input.contactPermission, 'review-required'),
    location: text(input.location, 'Location unknown'),
    deadline: text(input.deadline),
    urgency: text(input.urgency, 'medium').toLowerCase(),
    estimatedValueMin: Math.max(0, number(input.estimatedValueMin)),
    estimatedValueMax: Math.max(0, number(input.estimatedValueMax || input.estimatedValueMin)),
    estimatedCostMin: Math.max(0, number(input.estimatedCostMin)),
    estimatedCostMax: Math.max(0, number(input.estimatedCostMax || input.estimatedCostMin)),
    skills: list(input.skills),
    confidence: Math.min(100, Math.max(0, number(input.confidence, 50))),
    suggestedResponse: text(input.suggestedResponse),
    nextAction: text(input.nextAction, 'Review the evidence and choose the next action.'),
    createdAt,
    updatedAt: timestamp(input.updatedAt, createdAt),
    expiresAt: input.expiresAt ? timestamp(input.expiresAt, '') : ''
  };
}

export function scoreOpportunityCluster(cluster = {}, now = new Date()) {
  const signals = Array.isArray(cluster.signals) ? cluster.signals : [];
  const primary = signals[0] || cluster;
  const urgency = URGENCY_WEIGHTS[text(primary.urgency, 'medium').toLowerCase()] || URGENCY_WEIGHTS.medium;
  const confidence = Math.min(25, number(primary.confidence) / 4);
  const evidence = text(primary.buyerWords).length >= 12 ? 15 : 0;
  const permission = ['approved-api', 'first-party', 'human-provided', 'explicit-consent'].includes(text(primary.policyStatus)) ? 12 : 0;
  const margin = Math.max(0, number(primary.estimatedValueMin) - number(primary.estimatedCostMax));
  const marginScore = Math.min(12, margin / 25);
  const expiresAt = Date.parse(primary.expiresAt);
  const expirationPenalty = Number.isFinite(expiresAt) && expiresAt < now.getTime() ? 100 : 0;
  return Math.max(0, Math.round(urgency + confidence + evidence + permission + marginScore - expirationPenalty));
}

export function createOpportunityCluster(input = {}, now = new Date()) {
  const signals = (Array.isArray(input.signals) && input.signals.length ? input.signals : [input])
    .map(signal => createDemandSignal(signal, now));
  const primary = signals[0];
  const cluster = {
    schemaVersion: OPPORTUNITY_ENGINE_SCHEMA_VERSION,
    id: text(input.id) || makeId('opportunity'),
    title: text(input.title || input.need, primary.need),
    status: text(input.status, 'new'),
    owner: text(input.owner, 'Thomas'),
    signals,
    suggestedResponse: text(input.suggestedResponse, primary.suggestedResponse),
    nextAction: text(input.nextAction, primary.nextAction),
    createdAt: timestamp(input.createdAt, primary.createdAt),
    updatedAt: timestamp(input.updatedAt, primary.updatedAt),
    expiresAt: input.expiresAt ? timestamp(input.expiresAt, primary.expiresAt) : primary.expiresAt
  };
  return {
    ...cluster,
    actionabilityScore: scoreOpportunityCluster(cluster, now)
  };
}

export function createOpportunityEngineState(input = {}, now = new Date()) {
  const signals = (Array.isArray(input.signals) ? input.signals : []).map(signal => createDemandSignal(signal, now));
  const opportunities = (Array.isArray(input.opportunities) ? input.opportunities : [])
    .map(cluster => createOpportunityCluster(cluster, now));
  return {
    schemaVersion: OPPORTUNITY_ENGINE_SCHEMA_VERSION,
    signals,
    opportunities,
    updatedAt: timestamp(input.updatedAt, now.toISOString())
  };
}

export function addOpportunity(state = {}, input = {}, now = new Date()) {
  const current = createOpportunityEngineState(state, now);
  const signal = createDemandSignal(input, now);
  const opportunity = createOpportunityCluster({ ...input, signals: [signal] }, now);
  return {
    ...current,
    signals: [signal, ...current.signals],
    opportunities: [opportunity, ...current.opportunities],
    updatedAt: now.toISOString()
  };
}

export function ingestOpportunity(state = {}, input = {}, now = new Date()) {
  const current = createOpportunityEngineState(state, now);
  const fingerprint = opportunitySignalFingerprint(input);
  const duplicate = current.signals.find(signal => signal.sourceFingerprint === fingerprint);
  if (duplicate) {
    return { state: current, created: false, duplicateSignalId: duplicate.id };
  }
  return { state: addOpportunity(current, { ...input, sourceFingerprint: fingerprint }, now), created: true };
}

export function updateOpportunity(state = {}, opportunityId, patch = {}, now = new Date()) {
  const current = createOpportunityEngineState(state, now);
  return {
    ...current,
    opportunities: current.opportunities.map(opportunity => (
      opportunity.id === opportunityId
        ? createOpportunityCluster({ ...opportunity, ...patch, updatedAt: now.toISOString() }, now)
        : opportunity
    )),
    updatedAt: now.toISOString()
  };
}

export function sortOpportunityClusters(opportunities = [], now = new Date()) {
  const statusOrder = { new: 0, 'response-ready': 1, reviewing: 2, contacted: 3, won: 4, passed: 5, expired: 6 };
  return [...opportunities]
    .map(opportunity => createOpportunityCluster(opportunity, now))
    .sort((left, right) => {
      const leftStatus = statusOrder[left.status] ?? 3;
      const rightStatus = statusOrder[right.status] ?? 3;
      if (leftStatus !== rightStatus) return leftStatus - rightStatus;
      if (right.actionabilityScore !== left.actionabilityScore) return right.actionabilityScore - left.actionabilityScore;
      return String(right.updatedAt).localeCompare(String(left.updatedAt));
    });
}

function getDefaultStorage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

export function readOpportunityEngineState(storage = getDefaultStorage(), key = OPPORTUNITY_ENGINE_STORAGE_KEY) {
  if (!storage) return createOpportunityEngineState();
  try {
    const raw = storage.getItem(key);
    return createOpportunityEngineState(raw ? JSON.parse(raw) : {});
  } catch {
    return createOpportunityEngineState();
  }
}

export function writeOpportunityEngineState(state, storage = getDefaultStorage(), key = OPPORTUNITY_ENGINE_STORAGE_KEY) {
  if (!storage) return false;
  try {
    storage.setItem(key, JSON.stringify(createOpportunityEngineState(state)));
    return true;
  } catch {
    return false;
  }
}

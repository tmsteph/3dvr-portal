import { evaluatePositiveSum } from '../kernel/positiveSum.js';
import { normalizeOpportunitySearchMode } from '../money/scoring.js';
import { toCanonicalOpportunityStatus } from '../opportunity-lifecycle.js';

// Browser- and Node-safe Opportunity Engine records.
// External source connectors may add DemandSignals later, but every signal must
// retain its provenance and policy state before it can become actionable.

export const OPPORTUNITY_ENGINE_SCHEMA_VERSION = 5;
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

function clampScore(value, fallback = 50) {
  return Math.min(100, Math.max(0, Math.round(number(value, fallback))));
}

function geometricMeanScore(values = []) {
  const normalized = values.map(value => Math.max(0, Math.min(100, number(value, 0))) / 100);
  if (!normalized.length || normalized.some(value => value === 0)) return 0;
  const product = normalized.reduce((total, value) => total * value, 1);
  return clampScore(Math.pow(product, 1 / normalized.length) * 100, 0);
}

function list(value) {
  if (Array.isArray(value)) return value.map(item => text(item)).filter(Boolean);
  return text(value)
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function ids(value) {
  return [...new Set(list(value))];
}

function timestamp(value, fallback = new Date().toISOString()) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : fallback;
}

function makeId(prefix = 'record') {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function resolveTwinId(input = {}) {
  return text(input.twinId || input.twin_id || input.ownerId, 'thomas-legacy');
}

function normalizeFingerprintPart(value) {
  return text(value).toLowerCase().replace(/\s+/g, ' ');
}

function normalizeCanonicalPart(value) {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function opportunityDateToken(input = {}) {
  const direct = text(input.startDate || input.date || input.deadline);
  const haystack = [direct, input.title, input.need, input.buyerWords, input.evidence]
    .map(value => text(value))
    .filter(Boolean)
    .join(' ');

  const iso = haystack.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;

  const named = haystack.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(20\d{2}))?/i);
  if (!named) return '';
  const monthMap = {
    jan: '01', january: '01', feb: '02', february: '02', mar: '03', march: '03',
    apr: '04', april: '04', may: '05', jun: '06', june: '06', jul: '07', july: '07',
    aug: '08', august: '08', sep: '09', sept: '09', september: '09',
    oct: '10', october: '10', nov: '11', november: '11', dec: '12', december: '12'
  };
  const month = monthMap[named[1].toLowerCase().replace('.', '')];
  const day = named[2].padStart(2, '0');
  return named[3] ? `${named[3]}-${month}-${day}` : `${month}-${day}`;
}

export function opportunityCanonicalFingerprint(input = {}) {
  const explicit = normalizeCanonicalPart(
    input.canonicalOpportunityId || input.canonicalId || input.opportunityKey
  );
  if (explicit) return `canonical:${explicit}`;

  const role = normalizeCanonicalPart(input.role || input.title || input.need);
  const location = normalizeCanonicalPart(input.location);
  const date = opportunityDateToken(input);
  const organization = normalizeCanonicalPart(
    input.organizationId || input.companyId || input.company || input.organization || input.client
  );

  if (organization && role && date) {
    return ['job', organization, role, location, date].join('|');
  }

  // Source-independent clustering without an organization is deliberately
  // conservative: require a specific role/title, location, and date.
  if (role.length >= 10 && location && date) {
    return ['job', role, location, date].join('|');
  }

  return '';
}

export function normalizeOpportunityLinks(input = {}) {
  const links = input.links && typeof input.links === 'object' && !Array.isArray(input.links)
    ? input.links
    : {};

  return {
    personId: text(input.personId || links.personId),
    organizationId: text(input.organizationId || links.organizationId),
    projectId: text(input.projectId || links.projectId),
    taskIds: ids(input.taskIds ?? links.taskIds),
    messageIds: ids(input.messageIds ?? links.messageIds),
    calendarEventIds: ids(input.calendarEventIds ?? links.calendarEventIds),
    paymentIds: ids(input.paymentIds ?? links.paymentIds),
    artifactIds: ids(input.artifactIds ?? links.artifactIds)
  };
}

export function opportunitySignalFingerprint(input = {}) {
  const explicitId = normalizeFingerprintPart(input.externalId || input.sourceId);
  if (explicitId) {
    // A source record stays the same record even when it reaches us through a
    // different transport (API, forwarded message, browser import, etc.).
    const sourceIdentity = normalizeFingerprintPart(
      input.sourceLabel || input.source || input.acquisitionMode
    );
    return [sourceIdentity, explicitId].join(':');
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
    twinId: resolveTwinId(input),
    scopeStatus: text(input.twinId || input.twin_id || input.ownerId) ? 'scoped' : 'legacy-default',
    need: text(input.need, 'Unspecified need'),
    buyerWords: text(input.buyerWords || input.evidence),
    sourceLabel: text(input.sourceLabel || input.source, 'Manual forward'),
    sourceUrl: text(input.sourceUrl),
    externalId: text(input.externalId || input.sourceId),
    sourceFingerprint: text(input.sourceFingerprint) || opportunitySignalFingerprint(input),
    canonicalFingerprint: text(input.canonicalFingerprint) || opportunityCanonicalFingerprint(input),
    acquisitionMode: text(input.acquisitionMode, 'manual-forward'),
    policyStatus: text(input.policyStatus, 'human-provided'),
    contactPermission: text(input.contactPermission, 'review-required'),
    location: text(input.location, 'Location unknown'),
    availability: text(input.availability, 'unknown').toLowerCase(),
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

export function scoreOpportunityDimensions(cluster = {}, now = new Date()) {
  const signals = Array.isArray(cluster.signals) ? cluster.signals : [];
  const primary = signals[0] || cluster;
  const searchMode = normalizeOpportunitySearchMode(cluster.searchMode || primary.searchMode);
  const positiveSum = evaluatePositiveSum(cluster);
  const urgencyRaw = URGENCY_WEIGHTS[text(primary.urgency, 'medium').toLowerCase()] || URGENCY_WEIGHTS.medium;
  const confidenceRaw = Math.min(25, number(primary.confidence) / 4);
  const evidenceRaw = text(primary.buyerWords).length >= 12 ? 15 : 0;
  const permissionRaw = ['approved-api', 'first-party', 'human-provided', 'explicit-consent'].includes(text(primary.policyStatus)) ? 12 : 0;
  const valueFloor = Math.max(0, number(primary.estimatedValueMin));
  const costCeiling = Math.max(0, number(primary.estimatedCostMax));
  const margin = Math.max(0, valueFloor - costCeiling);
  const marginRaw = Math.min(12, margin / 25);
  const expiresAt = Date.parse(primary.expiresAt);
  const expired = Number.isFinite(expiresAt) && expiresAt < now.getTime();
  const availability = text(cluster.availability || primary.availability, 'unknown').toLowerCase();
  const hardAvailabilityConflict = ['conflict', 'blocked', 'unavailable'].includes(availability);
  const actionabilityScore = (expired || hardAvailabilityConflict)
    ? 0
    : clampScore(urgencyRaw + confidenceRaw + evidenceRaw + permissionRaw + marginRaw, 0);
  const marginRatioScore = valueFloor > 0 ? clampScore((margin / valueFloor) * 100, 0) : 0;
  const urgencyScore = clampScore((urgencyRaw / URGENCY_WEIGHTS.immediate) * 100, 50);
  const evidenceScore = text(primary.buyerWords).length >= 12 ? 100 : 30;
  const inferredDemandScore = clampScore(
    urgencyScore * 0.4
      + number(primary.confidence, 50) * 0.35
      + evidenceScore * 0.25,
    0
  );
  const demandScore = clampScore(cluster.demandScore ?? primary.demandScore, inferredDemandScore);
  const explicitProfit = Number(cluster.profitScore ?? primary.profitScore);
  const profitScore = Number.isFinite(explicitProfit)
    ? clampScore(explicitProfit)
    : clampScore(marginRatioScore * 0.55 + number(primary.confidence, 50) * 0.25 + urgencyScore * 0.2);
  const alignmentScore = clampScore(
    cluster.alignmentScore ?? cluster.fitScore ?? primary.alignmentScore ?? primary.fitScore,
    50
  );
  const fulfillmentFallback = list(primary.skills).length ? 70 : 55;
  const fulfillmentScore = clampScore(cluster.fulfillmentScore ?? primary.fulfillmentScore, fulfillmentFallback);

  // Kernel-facing names make the ranking model understandable across products:
  // fit = mission/person alignment, demand = evidence of buyer need,
  // effort = execution efficiency (higher means easier), revenue = economic upside.
  const fitScore = clampScore(cluster.fitScore ?? primary.fitScore, alignmentScore);
  const effortScore = clampScore(cluster.effortScore ?? primary.effortScore, fulfillmentScore);
  const revenueScore = clampScore(cluster.revenueScore ?? primary.revenueScore, profitScore);
  const opportunityScore = geometricMeanScore([fitScore, demandScore, effortScore, revenueScore]);

  const blends = {
    aligned: { actionability: 0.4, profit: 0.15, alignment: 0.3, fulfillment: 0.15 },
    profit: { actionability: 0.3, profit: 0.45, alignment: 0.05, fulfillment: 0.2 },
    portfolio: { actionability: 0.4, profit: 0.3, alignment: 0.15, fulfillment: 0.15 }
  };
  const blend = blends[searchMode];
  const economicPriorityScore = (expired || hardAvailabilityConflict) ? 0 : clampScore(
    actionabilityScore * blend.actionability
      + profitScore * blend.profit
      + alignmentScore * blend.alignment
      + fulfillmentScore * blend.fulfillment,
    0
  );

  // Preserve mode-specific economics while letting a weak kernel dimension drag
  // an otherwise attractive opportunity down. The geometric mean makes weak
  // fit, demand, effort, or revenue visible instead of hiding it in an average.
  const blendedPriorityScore = clampScore(
    economicPriorityScore * 0.65 + opportunityScore * 0.35,
    0
  );
  const priorityScore = (positiveSum.positiveSumEligible && !hardAvailabilityConflict)
    ? blendedPriorityScore
    : 0;
  const experimentRecommended = Boolean(
    positiveSum.positiveSumEligible
      && !expired
      && !hardAvailabilityConflict
      && priorityScore >= 60
      && demandScore >= 55
  );

  return {
    searchMode,
    availability,
    hardAvailabilityConflict,
    expired,
    actionabilityScore,
    profitScore,
    alignmentScore,
    fulfillmentScore,
    fitScore,
    demandScore,
    effortScore,
    revenueScore,
    opportunityScore,
    economicPriorityScore,
    priorityScore,
    experimentRecommended,
    ...positiveSum
  };
}

export function scoreOpportunityCluster(cluster = {}, now = new Date()) {
  return scoreOpportunityDimensions(cluster, now).actionabilityScore;
}

export function createOpportunityCluster(input = {}, now = new Date()) {
  const signals = (Array.isArray(input.signals) && input.signals.length ? input.signals : [input])
    .map(signal => createDemandSignal(signal, now));
  const primary = signals[0];
  const policy = evaluatePositiveSum(input);
  const cluster = {
    schemaVersion: OPPORTUNITY_ENGINE_SCHEMA_VERSION,
    id: text(input.id) || makeId('opportunity'),
    title: text(input.title || input.need, primary.need),
    canonicalFingerprint: text(input.canonicalFingerprint)
      || opportunityCanonicalFingerprint(input)
      || primary.canonicalFingerprint,
    status: text(input.status, 'new'),
    canonicalStatus: toCanonicalOpportunityStatus(
      input.status || input.canonicalStatus || 'new',
      'engine'
    ),
    twinId: resolveTwinId(input),
    owner: text(input.owner, 'Thomas'),
    scopeStatus: text(input.twinId || input.twin_id || input.ownerId) ? 'scoped' : 'legacy-default',
    expectedOutcome: text(input.expectedOutcome),
    availability: text(input.availability, primary.availability || 'unknown').toLowerCase(),
    searchMode: normalizeOpportunitySearchMode(input.searchMode || primary.searchMode),
    alignmentScore: clampScore(
      input.alignmentScore ?? input.fitScore ?? primary.alignmentScore ?? primary.fitScore,
      50
    ),
    fulfillmentScore: clampScore(input.fulfillmentScore ?? primary.fulfillmentScore, list(primary.skills).length ? 70 : 55),
    ...(Number.isFinite(Number(input.profitScore ?? primary.profitScore)) ? { profitScore: clampScore(input.profitScore ?? primary.profitScore) } : {}),
    ...(Number.isFinite(Number(input.fitScore ?? primary.fitScore)) ? { fitScore: clampScore(input.fitScore ?? primary.fitScore) } : {}),
    ...(Number.isFinite(Number(input.demandScore ?? primary.demandScore)) ? { demandScore: clampScore(input.demandScore ?? primary.demandScore) } : {}),
    ...(Number.isFinite(Number(input.effortScore ?? primary.effortScore)) ? { effortScore: clampScore(input.effortScore ?? primary.effortScore) } : {}),
    ...(Number.isFinite(Number(input.revenueScore ?? primary.revenueScore)) ? { revenueScore: clampScore(input.revenueScore ?? primary.revenueScore) } : {}),
    ...policy,
    signals,
    links: normalizeOpportunityLinks(input),
    suggestedResponse: text(input.suggestedResponse, primary.suggestedResponse),
    nextAction: text(input.nextAction, primary.nextAction),
    nextActionOwner: text(input.nextActionOwner, input.owner || 'Thomas'),
    followUpAt: input.followUpAt ? timestamp(input.followUpAt, '') : '',
    createdAt: timestamp(input.createdAt, primary.createdAt),
    updatedAt: timestamp(input.updatedAt, primary.updatedAt),
    expiresAt: input.expiresAt ? timestamp(input.expiresAt, primary.expiresAt) : primary.expiresAt
  };
  return {
    ...cluster,
    ...scoreOpportunityDimensions(cluster, now)
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
  const incomingTwinId = resolveTwinId(input);
  const duplicate = current.signals.find(signal => (
    signal.twinId === incomingTwinId
    && signal.sourceFingerprint === fingerprint
  ));
  if (duplicate) {
    return { state: current, created: false, duplicateSignalId: duplicate.id };
  }

  const canonicalFingerprint = opportunityCanonicalFingerprint(input);
  const existing = canonicalFingerprint
    ? current.opportunities.find(opportunity => (
      opportunity.twinId === incomingTwinId
      && opportunity.canonicalFingerprint === canonicalFingerprint
    ))
    : null;

  if (existing) {
    const signal = createDemandSignal({
      ...input,
      sourceFingerprint: fingerprint,
      canonicalFingerprint
    }, now);
    const opportunities = current.opportunities.map(opportunity => {
      if (opportunity.id !== existing.id) return opportunity;
      return createOpportunityCluster({
        ...opportunity,
        canonicalFingerprint,
        signals: [...(opportunity.signals || []), signal],
        updatedAt: now.toISOString()
      }, now);
    });
    return {
      state: {
        ...current,
        signals: [signal, ...current.signals],
        opportunities,
        updatedAt: now.toISOString()
      },
      created: false,
      clustered: true,
      opportunityId: existing.id,
      signalId: signal.id
    };
  }

  return {
    state: addOpportunity(current, {
      ...input,
      sourceFingerprint: fingerprint,
      canonicalFingerprint
    }, now),
    created: true
  };
}

export function updateOpportunity(state = {}, opportunityId, patch = {}, now = new Date()) {
  const current = createOpportunityEngineState(state, now);
  return {
    ...current,
    opportunities: current.opportunities.map(opportunity => {
      if (opportunity.id !== opportunityId) return opportunity;
      return createOpportunityCluster({
        ...opportunity,
        ...patch,
        links: {
          ...(opportunity.links || {}),
          ...(patch.links || {})
        },
        updatedAt: now.toISOString()
      }, now);
    }),
    updatedAt: now.toISOString()
  };
}

export function sortOpportunityClusters(opportunities = [], now = new Date()) {
  const statusOrder = { new: 0, 'response-ready': 1, experimenting: 2, reviewing: 3, contacted: 4, won: 5, passed: 6, expired: 7 };
  return [...opportunities]
    .map(opportunity => createOpportunityCluster(opportunity, now))
    .sort((left, right) => {
      if (left.positiveSumEligible !== right.positiveSumEligible) return left.positiveSumEligible ? -1 : 1;
      if (left.expired !== right.expired) return left.expired ? 1 : -1;
      const leftStatus = statusOrder[left.status] ?? 3;
      const rightStatus = statusOrder[right.status] ?? 3;
      if (leftStatus !== rightStatus) return leftStatus - rightStatus;
      if (right.priorityScore !== left.priorityScore) return right.priorityScore - left.priorityScore;
      if (right.opportunityScore !== left.opportunityScore) return right.opportunityScore - left.opportunityScore;
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

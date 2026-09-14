import { DEFAULT_GUN_PEERS, getNode } from './homepage-hero.js';
import { normalizeVentureCapsule } from '../money-printer/ventureCapsules.js';

export const MARKET_PULSE_CAPSULE_ROOT_PATH = Object.freeze([
  '3dvr-portal',
  'growth',
  'market-pulse',
  'venture-capsules',
]);
export const MARKET_PULSE_CAPSULE_LATEST_PATH = Object.freeze([
  ...MARKET_PULSE_CAPSULE_ROOT_PATH,
  'latest',
]);
export const MARKET_PULSE_CAPSULE_RUNS_PATH = Object.freeze([
  ...MARKET_PULSE_CAPSULE_ROOT_PATH,
  'runs',
]);

function clean(value = '') {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function slug(value = '', fallback = 'opportunity') {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || fallback;
}

function asDate(value, fallback = new Date()) {
  const parsed = value instanceof Date ? value : new Date(value || '');
  return Number.isFinite(parsed.getTime()) ? parsed : fallback;
}

function addDays(value, days = 7) {
  const date = asDate(value);
  return new Date(date.getTime() + (days * 24 * 60 * 60 * 1000)).toISOString();
}

function priceCents(value = '') {
  const match = clean(value).match(/\$\s*([\d,]+(?:\.\d{1,2})?)/);
  if (!match) return 0;
  const amount = Number(match[1].replace(/,/g, ''));
  return Number.isFinite(amount) ? Math.max(0, Math.round(amount * 100)) : 0;
}

function evidenceList(opportunity = {}) {
  return Array.isArray(opportunity.evidence)
    ? opportunity.evidence.map(clean).filter(Boolean).slice(0, 6)
    : [];
}

export function buildMarketPulseCapsuleCandidates(pulse = {}) {
  const generatedAt = asDate(pulse.generatedAt).toISOString();
  const runId = clean(pulse.runId) || `market-pulse-${generatedAt}`;
  const searchMode = clean(pulse.profile?.searchMode).toLowerCase() || 'portfolio';
  const opportunities = Array.isArray(pulse.opportunities) ? pulse.opportunities : [];

  return opportunities.slice(0, 6).map((opportunity, index) => {
    const opportunityKey = clean(opportunity.id) || slug(opportunity.title || `opportunity-${index + 1}`);
    const experimentId = `experiment-market-pulse-${slug(opportunityKey)}`;
    const evidence = evidenceList(opportunity);
    const capsule = normalizeVentureCapsule({
      id: `capsule-${slug(experimentId)}`,
      sourceId: experimentId,
      mode: opportunity.searchMode || searchMode,
      buyer: opportunity.audience,
      demandEvidenceIds: evidence,
      offer: opportunity.solution || opportunity.mvp || opportunity.title,
      priceCents: priceCents(opportunity.suggestedPrice),
      estimatedVariableCostCents: 0,
      supplyPath: ['Market Pulse evidence', 'manual or agent-assisted fulfillment'],
      channel: 'market-pulse',
      budgetCapCents: 0,
      successCondition: 'One paid pilot or equivalent strong buyer commitment within 7 days.',
      killCondition: 'No stronger paid-demand evidence before expiration or after the declared validation threshold.',
      priorityScore: opportunity.score || 50,
      status: 'queued',
      createdAt: generatedAt,
      updatedAt: generatedAt,
      expiresAt: addDays(generatedAt, 7),
      policy: {
        maxAutomatedSpendCents: 0,
        externalWrites: 'approval-required',
      },
    }, asDate(generatedAt));

    return {
      id: `candidate-${slug(experimentId)}`,
      sourceRunId: runId,
      sourceOpportunityId: opportunityKey,
      title: clean(opportunity.title) || 'Untitled Market Pulse opportunity',
      pain: clean(opportunity.problem),
      buyer: clean(opportunity.audience),
      offer: clean(opportunity.solution || opportunity.mvp || opportunity.title),
      suggestedPrice: clean(opportunity.suggestedPrice),
      evidence,
      marketScore: Number(opportunity.marketScore || 0),
      profitScore: Number(opportunity.profitScore || 0),
      alignmentScore: Number(opportunity.alignmentScore || 0),
      fulfillmentScore: Number(opportunity.fulfillmentScore || 0),
      capsule,
    };
  });
}

export function serializeMarketPulseCapsuleCandidates(pulse = {}, candidates = buildMarketPulseCapsuleCandidates(pulse)) {
  return {
    runId: clean(pulse.runId),
    generatedAt: clean(pulse.generatedAt),
    candidateCount: candidates.length,
    candidatesJson: JSON.stringify(candidates),
  };
}

export function deserializeMarketPulseCapsuleCandidates(record = {}) {
  let candidates = [];
  try {
    const parsed = JSON.parse(String(record.candidatesJson || '[]'));
    if (Array.isArray(parsed)) candidates = parsed;
  } catch (_error) {
    candidates = [];
  }
  return {
    runId: clean(record.runId),
    generatedAt: clean(record.generatedAt),
    candidateCount: Number(record.candidateCount || candidates.length),
    candidates,
  };
}

function onceNode(node, timeoutMs = 2500) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value || null);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    try {
      node.once((value) => finish(value));
    } catch (_error) {
      finish(null);
    }
  });
}

function putNode(node, value, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(result);
    };
    const timer = setTimeout(() => finish(new Error('Market Pulse capsule queue write timed out.')), timeoutMs);
    try {
      node.put(value, (ack) => {
        if (ack?.err) finish(new Error(String(ack.err)));
        else finish(null, ack || {});
      });
    } catch (error) {
      finish(error);
    }
  });
}

async function resolveGunImpl(explicitImpl) {
  if (explicitImpl) return explicitImpl;
  const moduleResult = await import('gun');
  if (typeof moduleResult?.default === 'function') return moduleResult.default;
  if (typeof moduleResult === 'function') return moduleResult;
  throw new Error('Unable to load Gun for Market Pulse capsule persistence.');
}

function parsePeers(value, fallback = DEFAULT_GUN_PEERS) {
  if (Array.isArray(value)) return value.filter(Boolean);
  const peers = String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return peers.length ? peers : [...fallback];
}

export async function createMarketPulseCapsuleClient(options = {}) {
  const GunImpl = await resolveGunImpl(options.GunImpl);
  const peers = parsePeers(options.peers || options.gunPeers || options.config?.GROWTH_GUN_PEERS);
  const gun = options.gun || GunImpl({
    peers,
    localStorage: false,
    radisk: false,
    file: false,
    multicast: false,
    axe: false,
  });
  const latestNode = getNode(gun, MARKET_PULSE_CAPSULE_LATEST_PATH);
  const runsNode = getNode(gun, MARKET_PULSE_CAPSULE_RUNS_PATH);

  return {
    async readLatest() {
      return deserializeMarketPulseCapsuleCandidates(await onceNode(latestNode));
    },
    async write(pulse, candidates = buildMarketPulseCapsuleCandidates(pulse)) {
      const record = serializeMarketPulseCapsuleCandidates(pulse, candidates);
      await putNode(latestNode, record);
      if (record.runId) await putNode(runsNode.get(record.runId), record);
      return {
        runId: record.runId,
        candidatesPublished: candidates.length,
      };
    },
  };
}

export async function persistMarketPulseCapsuleCandidates(pulse = {}, options = {}) {
  const candidates = buildMarketPulseCapsuleCandidates(pulse);
  if (Boolean(options.dryRun || pulse.dryRun)) {
    return {
      skipped: true,
      reason: 'dry run',
      candidatesPublished: 0,
      candidates,
    };
  }
  const client = options.capsuleClient || await createMarketPulseCapsuleClient(options);
  return {
    ...(await client.write(pulse, candidates)),
    skipped: false,
    candidates,
  };
}

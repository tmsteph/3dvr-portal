export const VENTURE_OUTCOME_MEMORY_SCHEMA_VERSION = 1;
export const VENTURE_OUTCOME_MEMORY_GUN_NODE = 'venture-outcome-memory-v1';

const STOP_WORDS = new Set([
  'about', 'after', 'again', 'also', 'and', 'are', 'because', 'been', 'before', 'being',
  'build', 'can', 'could', 'from', 'have', 'help', 'into', 'just', 'like', 'make', 'more',
  'need', 'next', 'people', 'small', 'some', 'that', 'their', 'them', 'then', 'there',
  'these', 'they', 'this', 'those', 'want', 'what', 'when', 'where', 'which', 'with', 'would'
]);

function clean(value = '') {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function timestamp(value) {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function latestTimestamp(values = []) {
  const latest = values
    .map((value) => Date.parse(value || ''))
    .filter(Number.isFinite)
    .sort((left, right) => right - left)[0];
  return Number.isFinite(latest) ? new Date(latest).toISOString() : null;
}

function fingerprint(value = '') {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function tokenize(value = '') {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .map((word) => word.replace(/^-+|-+$/g, ''))
    .filter((word) => word.length >= 3 && !STOP_WORDS.has(word) && !/^\d+$/.test(word));
}

function terminalOutcome(experiment = {}) {
  const capsuleStatus = clean(experiment.capsule?.status).toLowerCase();
  if (['Revenue', 'Scaling'].includes(experiment.status) || capsuleStatus === 'won') return 'won';
  if (experiment.status === 'Killed' || capsuleStatus === 'killed') return 'killed';
  if (capsuleStatus === 'expired') return 'expired';
  return '';
}

function normalizeEntry(value = {}) {
  const outcome = ['won', 'killed', 'expired'].includes(clean(value.outcome).toLowerCase())
    ? clean(value.outcome).toLowerCase()
    : '';
  return {
    id: clean(value.id || value.sourceOpportunityId || value.experimentId),
    sourceOpportunityId: clean(value.sourceOpportunityId),
    sourceRunId: clean(value.sourceRunId),
    title: clean(value.title),
    buyer: clean(value.buyer),
    pain: clean(value.pain),
    offer: clean(value.offer),
    outcome,
    observedAt: timestamp(value.observedAt || value.updatedAt),
  };
}

export function normalizeVentureOutcomeMemory(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  const entries = (Array.isArray(source.entries) ? source.entries : [])
    .map(normalizeEntry)
    .filter((entry) => entry.id && entry.outcome)
    .slice(-64);
  return {
    schemaVersion: VENTURE_OUTCOME_MEMORY_SCHEMA_VERSION,
    updatedAt: timestamp(source.updatedAt) || latestTimestamp(entries.map((entry) => entry.observedAt)),
    entries,
  };
}

export function deriveVentureOutcomeMemory(state = {}, now = new Date()) {
  const fallbackObservedAt = now instanceof Date ? now.toISOString() : new Date(now).toISOString();
  const entries = (Array.isArray(state.experiments) ? state.experiments : [])
    .filter((experiment) => experiment?.marketPulse)
    .map((experiment) => {
      const outcome = terminalOutcome(experiment);
      if (!outcome) return null;
      const observedAt = timestamp(
        experiment.outcomeObservedAt
        || experiment.updatedAt
        || experiment.capsule?.updatedAt
        || experiment.marketPulse?.observedAt,
      ) || fallbackObservedAt;
      return normalizeEntry({
        id: experiment.marketPulse.sourceOpportunityId || experiment.id,
        sourceOpportunityId: experiment.marketPulse.sourceOpportunityId,
        sourceRunId: experiment.marketPulse.sourceRunId,
        title: experiment.name,
        buyer: experiment.customer,
        pain: experiment.pain,
        offer: experiment.offer,
        outcome,
        observedAt,
      });
    })
    .filter(Boolean);
  return normalizeVentureOutcomeMemory({
    updatedAt: latestTimestamp(entries.map((entry) => entry.observedAt)),
    entries,
  });
}

export function mergeVentureOutcomeMemory(current = {}, incoming = {}) {
  const left = normalizeVentureOutcomeMemory(current);
  const right = normalizeVentureOutcomeMemory(incoming);
  const byId = new Map(left.entries.map((entry) => [entry.id, entry]));
  right.entries.forEach((entry) => {
    const existing = byId.get(entry.id);
    if (!existing) {
      byId.set(entry.id, entry);
      return;
    }
    const existingAt = Date.parse(existing.observedAt || '') || 0;
    const incomingAt = Date.parse(entry.observedAt || '') || 0;
    if (incomingAt >= existingAt) byId.set(entry.id, entry);
  });
  const entries = [...byId.values()]
    .sort((a, b) => (Date.parse(a.observedAt || '') || 0) - (Date.parse(b.observedAt || '') || 0))
    .slice(-64);
  return normalizeVentureOutcomeMemory({
    entries,
    updatedAt: latestTimestamp([
      left.updatedAt,
      right.updatedAt,
      ...entries.map((entry) => entry.observedAt),
    ]),
  });
}

function candidateTokens(candidate = {}) {
  return new Set(unique(tokenize([
    candidate.title,
    candidate.pain,
    candidate.buyer,
    candidate.offer,
  ].filter(Boolean).join(' '))));
}

function entryTokens(entry = {}) {
  return new Set(unique(tokenize([
    entry.title,
    entry.pain,
    entry.buyer,
    entry.offer,
  ].filter(Boolean).join(' '))));
}

function similarity(left = new Set(), right = new Set()) {
  if (!left.size || !right.size) return 0;
  let matches = 0;
  left.forEach((term) => {
    if (right.has(term)) matches += 1;
  });
  if (!matches) return 0;
  return Math.min(1, matches / Math.min(6, Math.min(left.size, right.size)));
}

export function scoreVentureOutcomeMemory(candidate = {}, memory = {}) {
  const normalized = normalizeVentureOutcomeMemory(memory);
  if (!normalized.entries.length) return { adjustment: 0, matches: 0 };
  const tokens = candidateTokens(candidate);
  let weighted = 0;
  let matches = 0;
  normalized.entries.forEach((entry) => {
    const overlap = similarity(tokens, entryTokens(entry));
    if (overlap < 0.2) return;
    matches += 1;
    const outcomeWeight = entry.outcome === 'won' ? 1 : (entry.outcome === 'killed' ? -0.75 : -0.35);
    weighted += outcomeWeight * overlap * 12;
  });
  return {
    adjustment: Math.max(-12, Math.min(12, Math.round(weighted * 10) / 10)),
    matches,
  };
}

export function ventureOutcomeMemoryKey(memory = {}) {
  const normalized = normalizeVentureOutcomeMemory(memory);
  if (!normalized.entries.length) return '';
  const signature = normalized.entries
    .map((entry) => [entry.id, entry.outcome, entry.observedAt || 'undated'].join(':'))
    .sort()
    .join('|');
  return [
    `v${normalized.schemaVersion}`,
    normalized.entries.length,
    fingerprint(signature),
  ].join(':');
}

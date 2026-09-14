export const VENTURE_CAPSULE_SCHEMA_VERSION = 1;

export const DEFAULT_VENTURE_PORTFOLIO_LIMITS = Object.freeze({
  maxActive: 1,
  maxResearch: 1,
  maxAutomatedSpendCents: 0
});

const TERMINAL_STATUSES = new Set(['won', 'killed', 'expired']);

function clean(value = '') {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function clampScore(value, fallback = 50) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(100, Math.round(parsed))) : fallback;
}

function cents(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : fallback;
}

function list(value) {
  if (Array.isArray(value)) return [...new Set(value.map(clean).filter(Boolean))];
  return clean(value) ? [clean(value)] : [];
}

function timestamp(value, fallback = new Date().toISOString()) {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : fallback;
}

function addDays(date, days) {
  return new Date(date.getTime() + (days * 24 * 60 * 60 * 1000)).toISOString();
}

function slug(value, fallback = 'venture') {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || fallback;
}

function firstPriceCents(value = '') {
  const match = String(value || '').match(/\$\s*([\d,]+(?:\.\d{1,2})?)/);
  if (!match) return 0;
  const amount = Number(match[1].replace(/,/g, ''));
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

function capsuleStatusForExperiment(experiment = {}, fallback = 'queued') {
  if (experiment.status === 'Killed') return 'killed';
  if (['Revenue', 'Scaling'].includes(experiment.status)) return 'won';
  return fallback;
}

export function normalizeVentureCapsule(input = {}, now = new Date()) {
  const createdAt = timestamp(input.createdAt, now.toISOString());
  const expiresAt = timestamp(input.expiresAt, addDays(new Date(createdAt), 7));
  const expired = Date.parse(expiresAt) < now.getTime();
  const status = expired && !TERMINAL_STATUSES.has(clean(input.status).toLowerCase())
    ? 'expired'
    : (clean(input.status).toLowerCase() || 'queued');

  return {
    schemaVersion: VENTURE_CAPSULE_SCHEMA_VERSION,
    id: clean(input.id) || `capsule-${slug(input.name || input.offer || input.buyer)}`,
    sourceId: clean(input.sourceId || input.ideaId || input.opportunityId || input.experimentId),
    mode: ['aligned', 'profit', 'portfolio'].includes(clean(input.mode).toLowerCase())
      ? clean(input.mode).toLowerCase()
      : 'portfolio',
    buyer: clean(input.buyer),
    demandEvidenceIds: list(input.demandEvidenceIds),
    offer: clean(input.offer),
    priceCents: cents(input.priceCents),
    estimatedVariableCostCents: cents(input.estimatedVariableCostCents),
    supplyPath: list(input.supplyPath),
    channel: clean(input.channel),
    budgetCapCents: cents(input.budgetCapCents),
    successCondition: clean(input.successCondition),
    killCondition: clean(input.killCondition),
    priorityScore: clampScore(input.priorityScore),
    status,
    createdAt,
    updatedAt: timestamp(input.updatedAt, createdAt),
    expiresAt,
    policy: {
      maxAutomatedSpendCents: cents(input.policy?.maxAutomatedSpendCents, 0),
      externalWrites: input.policy?.externalWrites === 'allowed' ? 'allowed' : 'approval-required',
      irreversibleActions: 'approval-required'
    }
  };
}

export function createVentureCapsuleFromIdea(idea = {}, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  return normalizeVentureCapsule({
    id: `capsule-${slug(idea.business_name || idea.id)}`,
    sourceId: idea.id,
    mode: idea.searchMode || idea.mode || options.mode || 'portfolio',
    buyer: idea.target_customer,
    demandEvidenceIds: idea.demandEvidenceIds || idea.evidenceIds || [],
    offer: idea.offer,
    priceCents: firstPriceCents(idea.revenue_path),
    estimatedVariableCostCents: options.estimatedVariableCostCents || 0,
    supplyPath: idea.tools_needed || [],
    channel: idea.channel || 'direct validation',
    budgetCapCents: options.budgetCapCents || 0,
    successCondition: options.successCondition || 'At least one paid pilot or equivalent strong buyer commitment within 7 days.',
    killCondition: options.killCondition || 'Fewer than 2 specific pain replies after 25 targeted contacts, or expiration without stronger evidence.',
    priorityScore: idea.total_score || idea.priorityScore || 50,
    status: options.status || 'queued',
    createdAt: now.toISOString(),
    expiresAt: options.expiresAt || addDays(now, 7),
    policy: options.policy
  }, now);
}

export function ensureVentureCapsule(experiment = {}, now = new Date()) {
  if (experiment.capsule) {
    return normalizeVentureCapsule({
      ...experiment.capsule,
      sourceId: experiment.capsule.sourceId || experiment.id,
      status: capsuleStatusForExperiment(experiment, experiment.capsule.status)
    }, now);
  }
  return normalizeVentureCapsule({
    id: `capsule-${slug(experiment.name || experiment.id)}`,
    sourceId: experiment.id,
    buyer: experiment.customer,
    offer: experiment.offer,
    priceCents: firstPriceCents(experiment.price_test),
    supplyPath: experiment.supplyPath || [],
    channel: 'existing experiment',
    successCondition: 'Produce paid demand or a strong buyer commitment before expiration.',
    killCondition: 'Kill after the declared validation threshold fails or the capsule expires.',
    priorityScore: experiment.priorityScore || 50,
    status: capsuleStatusForExperiment(experiment),
    createdAt: experiment.createdAt,
    updatedAt: experiment.updatedAt,
    expiresAt: experiment.expiresAt || addDays(now, 7)
  }, now);
}

export function allocateVentureCapsules(capsules = [], limits = {}, now = new Date()) {
  const normalizedLimits = {
    maxActive: Math.max(0, Number.isFinite(Number(limits.maxActive)) ? Math.floor(Number(limits.maxActive)) : DEFAULT_VENTURE_PORTFOLIO_LIMITS.maxActive),
    maxResearch: Math.max(0, Number.isFinite(Number(limits.maxResearch)) ? Math.floor(Number(limits.maxResearch)) : DEFAULT_VENTURE_PORTFOLIO_LIMITS.maxResearch),
    maxAutomatedSpendCents: cents(limits.maxAutomatedSpendCents, DEFAULT_VENTURE_PORTFOLIO_LIMITS.maxAutomatedSpendCents)
  };
  const normalized = capsules.map((capsule) => normalizeVentureCapsule(capsule, now));
  const terminal = normalized.filter((capsule) => TERMINAL_STATUSES.has(capsule.status));
  const candidates = normalized
    .filter((capsule) => !TERMINAL_STATUSES.has(capsule.status))
    .sort((left, right) => {
      if (right.priorityScore !== left.priorityScore) return right.priorityScore - left.priorityScore;
      return String(right.updatedAt).localeCompare(String(left.updatedAt));
    });

  const allocated = candidates.map((capsule, index) => {
    let status = 'queued';
    if (index < normalizedLimits.maxActive) status = 'active';
    else if (index < normalizedLimits.maxActive + normalizedLimits.maxResearch) status = 'research';
    return {
      ...capsule,
      status,
      policy: {
        ...capsule.policy,
        maxAutomatedSpendCents: Math.min(
          capsule.policy.maxAutomatedSpendCents,
          normalizedLimits.maxAutomatedSpendCents
        )
      }
    };
  });

  const all = [...allocated, ...terminal];
  return {
    limits: normalizedLimits,
    capsules: all,
    active: all.filter((capsule) => capsule.status === 'active'),
    research: all.filter((capsule) => capsule.status === 'research'),
    queued: all.filter((capsule) => capsule.status === 'queued'),
    terminal: all.filter((capsule) => TERMINAL_STATUSES.has(capsule.status)),
    attentionRule: `At most ${normalizedLimits.maxActive} active capsule and ${normalizedLimits.maxResearch} research capsule; discovery may remain unbounded.`
  };
}

export function applyVenturePortfolioLimits(experiments = [], limits = {}, now = new Date()) {
  const capsules = experiments.map((experiment) => ensureVentureCapsule(experiment, now));
  const allocation = allocateVentureCapsules(capsules, limits, now);
  const bySource = new Map(allocation.capsules.map((capsule) => [capsule.sourceId, capsule]));
  return experiments.map((experiment) => ({
    ...experiment,
    capsule: bySource.get(experiment.id) || ensureVentureCapsule(experiment, now)
  }));
}

export function capsuleCanAutoExecute(capsule = {}, action = {}) {
  const normalized = normalizeVentureCapsule(capsule);
  if (normalized.status !== 'active') return false;
  const actionType = clean(action.type).toLowerCase();
  const spendCents = cents(action.spendCents);
  if (spendCents > normalized.policy.maxAutomatedSpendCents) return false;
  if (['external_write', 'money_move', 'irreversible'].includes(actionType)) return false;
  return true;
}

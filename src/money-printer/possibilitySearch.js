import { normalizeVentureCapsule } from './ventureCapsules.js';

export const POSSIBILITY_SEARCH_SCHEMA_VERSION = 1;

const DEFAULT_DIMENSIONS = Object.freeze({
  offer: Object.freeze([
    Object.freeze({ key: 'baseline', label: 'Current outcome', expectedDelta: 0, learningDelta: 0, riskDelta: 0 }),
    Object.freeze({ key: 'narrow', label: 'Smaller, faster outcome', expectedDelta: -2, learningDelta: 8, riskDelta: -2 }),
    Object.freeze({ key: 'premium', label: 'Higher-value outcome', expectedDelta: 8, learningDelta: 10, riskDelta: 6 })
  ]),
  channel: Object.freeze([
    Object.freeze({ key: 'existing', label: 'Current reachable channel', expectedDelta: 0, learningDelta: 0, riskDelta: 0 }),
    Object.freeze({ key: 'inbound-referral', label: 'Inbound or referral path', expectedDelta: -2, learningDelta: 10, riskDelta: -2 }),
    Object.freeze({ key: 'partner', label: 'Partner distribution', expectedDelta: 3, learningDelta: 12, riskDelta: 4 })
  ]),
  delivery: Object.freeze([
    Object.freeze({ key: 'manual', label: 'Manual concierge delivery', expectedDelta: -2, learningDelta: 8, riskDelta: -2 }),
    Object.freeze({ key: 'automation-assisted', label: 'Automation-assisted delivery', expectedDelta: 5, learningDelta: 10, riskDelta: 4 }),
    Object.freeze({ key: 'partner-assisted', label: 'Partner-assisted delivery', expectedDelta: 2, learningDelta: 11, riskDelta: 5 })
  ]),
  pricing: Object.freeze([
    Object.freeze({ key: 'baseline', label: 'Current price hypothesis', expectedDelta: 0, learningDelta: 0, riskDelta: 0 }),
    Object.freeze({ key: 'deposit', label: 'Lower-friction paid commitment', expectedDelta: -3, learningDelta: 12, riskDelta: -1 }),
    Object.freeze({ key: 'premium', label: 'Premium price test', expectedDelta: 8, learningDelta: 10, riskDelta: 5 })
  ])
});

function clean(value = '') {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampScore(value, fallback = 50) {
  return Math.max(0, Math.min(100, Math.round(number(value, fallback))));
}

function slug(value, fallback = 'candidate') {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || fallback;
}

function primarySignal(opportunity = {}) {
  return Array.isArray(opportunity.signals) ? opportunity.signals[0] || {} : {};
}

function cartesian(dimensions = DEFAULT_DIMENSIONS) {
  const entries = Object.entries(dimensions);
  return entries.reduce((rows, [dimension, options]) => (
    rows.flatMap(row => options.map(option => ({
      ...row,
      [dimension]: option
    })))
  ), [{}]);
}

function changedDimensions(variant = {}) {
  const baselineKeys = {
    offer: 'baseline',
    channel: 'existing',
    delivery: 'manual',
    pricing: 'baseline'
  };
  return Object.entries(baselineKeys)
    .filter(([dimension, key]) => variant[dimension]?.key !== key)
    .map(([dimension]) => dimension);
}

function candidateScores(opportunity = {}, variant = {}) {
  const signal = primarySignal(opportunity);
  const priorityScore = clampScore(opportunity.priorityScore, 50);
  const demandScore = clampScore(opportunity.demandScore, 50);
  const revenueScore = clampScore(opportunity.revenueScore ?? opportunity.profitScore, 50);
  const effortScore = clampScore(opportunity.effortScore ?? opportunity.fulfillmentScore, 50);
  const confidenceScore = clampScore(signal.confidence ?? opportunity.confidenceScore, 50);
  const options = Object.values(variant);
  const expectedDelta = options.reduce((sum, option) => sum + number(option.expectedDelta), 0);
  const learningDelta = options.reduce((sum, option) => sum + number(option.learningDelta), 0);
  const riskDelta = options.reduce((sum, option) => sum + number(option.riskDelta), 0);
  const changed = changedDimensions(variant);
  const noveltyScore = clampScore((changed.length / Math.max(1, Object.keys(variant).length)) * 100, 0);
  const expectedValueScore = clampScore(
    priorityScore * 0.45
      + demandScore * 0.2
      + revenueScore * 0.2
      + effortScore * 0.15
      + expectedDelta,
    0
  );
  const learningScore = clampScore(
    (100 - confidenceScore) * 0.55
      + demandScore * 0.2
      + noveltyScore * 0.15
      + learningDelta,
    0
  );
  const riskScore = clampScore(Math.max(0, riskDelta), 0);
  const searchScore = opportunity.positiveSumEligible === false
    ? 0
    : clampScore(
      expectedValueScore * 0.5
        + learningScore * 0.25
        + noveltyScore * 0.15
        + confidenceScore * 0.1
        - riskScore * 0.25,
      0
    );

  return {
    expectedValueScore,
    learningScore,
    noveltyScore,
    confidenceScore,
    riskScore,
    searchScore
  };
}

export function createPossibilityCandidates(opportunity = {}, options = {}) {
  const dimensions = options.dimensions || DEFAULT_DIMENSIONS;
  const combinations = cartesian(dimensions);
  const parentOpportunityId = clean(opportunity.id) || 'untracked-opportunity';

  return combinations.map(variant => {
    const keys = Object.entries(variant).map(([dimension, option]) => `${dimension}:${option.key}`);
    const labels = Object.values(variant).map(option => option.label);
    const variantKey = keys.join('|');
    const scores = candidateScores(opportunity, variant);
    return {
      schemaVersion: POSSIBILITY_SEARCH_SCHEMA_VERSION,
      id: `possibility-${slug(parentOpportunityId)}-${slug(variantKey)}`,
      parentOpportunityId,
      variantKey,
      variant: Object.fromEntries(Object.entries(variant).map(([dimension, option]) => [dimension, option.key])),
      labels,
      hypothesis: `Test whether ${labels.join(' + ')} produces stronger buyer evidence than the current path.`,
      ...scores
    };
  });
}

function byExploit(left, right) {
  if (right.expectedValueScore !== left.expectedValueScore) return right.expectedValueScore - left.expectedValueScore;
  if (right.searchScore !== left.searchScore) return right.searchScore - left.searchScore;
  return right.confidenceScore - left.confidenceScore;
}

function explorationScore(candidate = {}) {
  return clampScore(
    number(candidate.learningScore) * 0.55
      + number(candidate.noveltyScore) * 0.35
      + number(candidate.expectedValueScore) * 0.1,
    0
  );
}

export function selectPossibilityPortfolio(candidates = [], limits = {}) {
  const maxExploit = Math.max(0, Math.floor(number(limits.maxExploit, 1)));
  const maxExplore = Math.max(0, Math.floor(number(limits.maxExplore, 1)));
  const eligible = candidates.filter(candidate => number(candidate.searchScore) > 0);
  const exploit = [...eligible].sort(byExploit).slice(0, maxExploit);
  const exploitIds = new Set(exploit.map(candidate => candidate.id));
  const explore = eligible
    .filter(candidate => !exploitIds.has(candidate.id) && number(candidate.noveltyScore) > 0)
    .sort((left, right) => {
      const difference = explorationScore(right) - explorationScore(left);
      if (difference) return difference;
      return byExploit(left, right);
    })
    .slice(0, maxExplore);
  const selectedIds = new Set([...exploit, ...explore].map(candidate => candidate.id));

  return {
    exploit: exploit.map(candidate => ({ ...candidate, role: 'exploit' })),
    explore: explore.map(candidate => ({ ...candidate, role: 'explore' })),
    queued: eligible.filter(candidate => !selectedIds.has(candidate.id)).map(candidate => ({ ...candidate, role: 'queue' })),
    searched: candidates.length,
    eligible: eligible.length
  };
}

export function createPossibilitySearchPlan(opportunity = {}, options = {}) {
  const candidates = createPossibilityCandidates(opportunity, options);
  const portfolio = selectPossibilityPortfolio(candidates, options);
  return {
    schemaVersion: POSSIBILITY_SEARCH_SCHEMA_VERSION,
    opportunityId: clean(opportunity.id),
    title: clean(opportunity.title || opportunity.need, 'Opportunity'),
    searchSpaceSize: candidates.length,
    candidates,
    portfolio
  };
}

export function possibilityCandidateToExperiment(opportunity = {}, candidate = {}, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const signal = primarySignal(opportunity);
  const experimentId = `experiment-${slug(candidate.id)}`;
  const role = ['exploit', 'explore'].includes(candidate.role) ? candidate.role : 'queue';
  const successCondition = 'Produce material evidence that improves demand, price, channel, or fulfillment confidence before the capsule expires.';
  const killCondition = 'Kill or rewrite the variant if it produces no stronger evidence before expiration or violates the positive-sum gate.';
  const capsule = normalizeVentureCapsule({
    id: `capsule-${slug(candidate.id)}`,
    sourceId: experimentId,
    mode: opportunity.searchMode || 'portfolio',
    buyer: clean(opportunity.title || signal.need, 'Reachable buyer'),
    demandEvidenceIds: (Array.isArray(opportunity.signals) ? opportunity.signals : []).map(item => clean(item.id)).filter(Boolean),
    offer: clean(opportunity.expectedOutcome || opportunity.title || signal.need, 'Smallest credible paid outcome'),
    estimatedVariableCostCents: Math.round(Math.max(0, number(signal.estimatedCostMax)) * 100),
    channel: candidate.variant?.channel || 'existing',
    budgetCapCents: 0,
    successCondition,
    killCondition,
    priorityScore: candidate.searchScore,
    status: 'queued',
    createdAt: now.toISOString(),
    search: {
      parentOpportunityId: candidate.parentOpportunityId,
      candidateId: candidate.id,
      variantKey: candidate.variantKey,
      hypothesis: candidate.hypothesis,
      role,
      expectedValueScore: candidate.expectedValueScore,
      learningScore: candidate.learningScore,
      noveltyScore: candidate.noveltyScore,
      searchScore: candidate.searchScore
    },
    policy: {
      maxAutomatedSpendCents: 0,
      externalWrites: 'approval-required'
    }
  }, now);

  return {
    id: experimentId,
    name: `${clean(opportunity.title, 'Opportunity')} · ${role === 'explore' ? 'explore' : 'exploit'} variant`,
    customer: clean(opportunity.title || signal.need, 'Reachable buyer'),
    pain: clean(signal.buyerWords || signal.need || opportunity.title),
    offer: capsule.offer,
    price_test: 'Price remains approval-gated; this variant is for evidence gathering first.',
    validation_test: candidate.hypothesis,
    status: 'Idea',
    priorityScore: candidate.searchScore,
    capsule,
    possibilitySearch: {
      ...candidate,
      role
    },
    traction: {
      leads_found: 0,
      messages_drafted: 0,
      messages_sent: 0,
      replies: 0,
      calls_booked: 0,
      revenue: 0
    },
    next_action: role === 'explore'
      ? 'Design the smallest reversible test that maximizes learning; keep contact and spend approval-gated.'
      : 'Run the smallest reversible test for the highest expected-value path; keep contact and spend approval-gated.'
  };
}

export function promoteOpportunityToPossibilityExperiments(opportunity = {}, options = {}) {
  if (opportunity.positiveSumEligible === false) return [];
  if (opportunity.experimentRecommended === false && options.force !== true) return [];
  const plan = createPossibilitySearchPlan(opportunity, options);
  return [...plan.portfolio.exploit, ...plan.portfolio.explore]
    .map(candidate => possibilityCandidateToExperiment(opportunity, candidate, options));
}

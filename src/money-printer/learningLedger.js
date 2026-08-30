const DEFAULT_BACKLOG = [
  { id: 'free-page-conversion-baseline', title: 'Measure the Free Page visit-to-lead conversion rate', hypothesis: 'A visible baseline will expose the highest-leverage funnel bottleneck.', metric: 'qualified_leads', confidence: 0.9, effort: 1, risk: 'GREEN', status: 'ready' },
  { id: 'buyer-language-research', title: 'Research recurring buyer language for one narrow service niche', hypothesis: 'Using the buyer’s own pain language will improve qualified replies.', metric: 'qualified_replies', confidence: 0.75, effort: 2, risk: 'GREEN', status: 'research' },
  { id: 'free-page-proof-test', title: 'Test one proof-focused Free Page message', hypothesis: 'Concrete proof will convert more qualified visitors than broad claims.', metric: 'qualified_leads', confidence: 0.65, effort: 2, risk: 'YELLOW', status: 'blocked-on-baseline' }
];

export const SIGNAL_KEYS = [
  'visits',
  'signups',
  'qualified_leads',
  'outreach_sent',
  'qualified_replies',
  'calls_booked',
  'customers',
  'revenue_cents',
  'stripe_attributed_checkouts',
  'stripe_attributed_revenue_cents',
  'stripe_mrr_cents',
  'founder_customers',
  'friend_customers',
  'stranger_customers',
  'founder_revenue_cents',
  'friend_revenue_cents',
  'stranger_revenue_cents',
  'agent_cost_cents'
];

export const REVENUE_PROVENANCE_KEYS = [
  'founder_revenue_cents',
  'friend_revenue_cents',
  'stranger_revenue_cents'
];

const PROGRESS_KEYS = [
  'signups',
  'qualified_leads',
  'qualified_replies',
  'calls_booked',
  'customers',
  'revenue_cents',
  'stranger_customers',
  'stranger_revenue_cents'
];

const DEFAULT_WEEKLY_BUDGET_CENTS = 15000;
const DEFAULT_ADAPT_AFTER_CYCLES = 3;
const STRANGER_CUSTOMER_GOAL = 10;

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

export function normalizeSignals(signals = {}) {
  return Object.fromEntries(SIGNAL_KEYS.map(key => [key, numberOrZero(signals[key])]));
}

export function experimentScore(experiment = {}) {
  const effort = Math.max(1, numberOrZero(experiment.effort));
  const riskPenalty = experiment.risk === 'GREEN' ? 0 : experiment.risk === 'YELLOW' ? 0.2 : 1;
  return Number(Math.max(0, numberOrZero(experiment.confidence) / effort - riskPenalty).toFixed(3));
}

export function rankBacklog(backlog = []) {
  return backlog.map(item => ({ ...item, score: experimentScore(item) }))
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
}

export function classifyMilestone(signals = {}) {
  const current = normalizeSignals(signals);
  if (current.stranger_customers >= STRANGER_CUSTOMER_GOAL) return 'repeatable-demand';
  if (current.stranger_customers > 0 || current.stranger_revenue_cents > 0) return 'stranger-dollar';
  if (current.friend_customers > 0 || current.friend_revenue_cents > 0) return 'friend-dollar';
  if (current.founder_customers > 0 || current.founder_revenue_cents > 0) return 'founder-dollar';
  if (current.revenue_cents > 0 || current.stripe_attributed_revenue_cents > 0) return 'unattributed-revenue';
  return 'pre-revenue';
}

function measuredRevenueCents(signals = {}) {
  const current = normalizeSignals(signals);
  return Math.max(current.revenue_cents, current.stripe_attributed_revenue_cents);
}

function buildEconomics(signals = {}, budget = {}) {
  const current = normalizeSignals(signals);
  const revenueCents = measuredRevenueCents(current);
  const costCents = current.agent_cost_cents;
  const weeklyBudgetCents = numberOrZero(budget.weekly_budget_cents || DEFAULT_WEEKLY_BUDGET_CENTS);
  return {
    revenue_cents: revenueCents,
    agent_cost_cents: costCents,
    net_cents: revenueCents - costCents,
    costs_measured: costCents > 0,
    self_sustaining: costCents > 0 && revenueCents > costCents,
    weekly_budget_cents: weeklyBudgetCents,
    budget_remaining_cents: Math.max(0, weeklyBudgetCents - costCents),
    budget_exhausted: weeklyBudgetCents > 0 && costCents >= weeklyBudgetCents
  };
}

function buildAutonomy(progress = {}) {
  const milestone = progress.milestone;
  const economics = progress.economics || {};
  let level = 0;
  let label = 'observe';
  if (milestone === 'founder-dollar' || milestone === 'friend-dollar' || milestone === 'unattributed-revenue') {
    level = 1;
    label = 'draft-and-test';
  }
  if (milestone === 'stranger-dollar' || milestone === 'repeatable-demand') {
    level = 2;
    label = 'preapproved-green-actions';
  }
  if (milestone === 'repeatable-demand' && economics.self_sustaining) {
    level = 3;
    label = 'scale-proven-green-actions';
  }
  return {
    level,
    label,
    rule: level === 0
      ? 'Research, measure, and create internal artifacts only.'
      : level === 1
        ? 'Prepare and test low-risk artifacts; external or financial actions remain gated.'
        : level === 2
          ? 'Execute only explicitly pre-approved GREEN actions within the budget and compliance caps.'
          : 'Scale previously successful GREEN actions within budget; sensitive actions remain gated.'
  };
}

export function buildLearningProgress(signals = {}, previousProgress = {}, budget = {}) {
  const current = normalizeSignals(signals);
  const economics = buildEconomics(current, budget);
  const milestone = classifyMilestone(current);
  const progress = {
    milestone,
    stranger_customers: current.stranger_customers,
    stranger_customer_goal: STRANGER_CUSTOMER_GOAL,
    stranger_customers_remaining: Math.max(0, STRANGER_CUSTOMER_GOAL - current.stranger_customers),
    stalled_cycles: numberOrZero(previousProgress.stalled_cycles),
    economics
  };
  return { ...progress, autonomy: buildAutonomy(progress) };
}

function dimensionForSignals(signals = {}, progress = {}) {
  const current = normalizeSignals(signals);
  const knownCustomers = Math.max(
    current.customers,
    current.founder_customers + current.friend_customers + current.stranger_customers
  );
  if (progress.economics?.budget_exhausted) {
    return {
      change_dimension: 'cost',
      reason: 'The measured agent operating cost has reached the weekly budget. Stop paid expansion and reduce cost before the next experiment.',
      success_metric: 'agent_cost_cents'
    };
  }
  if (current.visits === 0 && current.outreach_sent === 0) {
    return {
      change_dimension: 'distribution',
      reason: 'There is no measurable reach yet. Change one distribution channel before building more product.',
      success_metric: 'visits'
    };
  }
  if ((current.visits > 0 || current.outreach_sent > 0) && current.qualified_leads === 0 && current.qualified_replies === 0) {
    return {
      change_dimension: 'audience-or-message',
      reason: 'People are being reached but no qualified demand is appearing. Test one narrower audience or one clearer pain message.',
      success_metric: current.outreach_sent > 0 ? 'qualified_replies' : 'qualified_leads'
    };
  }
  if ((current.qualified_leads > 0 || current.qualified_replies > 0 || current.calls_booked > 0) && knownCustomers === 0) {
    return {
      change_dimension: 'offer',
      reason: 'Qualified interest exists but nobody has paid. Change one offer variable such as scope, proof, price presentation, or guarantee.',
      success_metric: 'customers'
    };
  }
  if (knownCustomers > 0 && current.stranger_customers === 0) {
    return {
      change_dimension: 'distribution',
      reason: 'Revenue exists, but none is proven to come from an unrelated buyer. Keep the offer stable and reach people outside the founder/friend network.',
      success_metric: 'stranger_customers'
    };
  }
  if (current.stranger_customers > 0 && current.stranger_customers < STRANGER_CUSTOMER_GOAL) {
    return {
      change_dimension: 'channel',
      reason: 'A stranger has paid. Keep the winning offer mostly stable and repeat the acquisition channel until ten unrelated customers validate demand.',
      success_metric: 'stranger_customers'
    };
  }
  if (current.stranger_customers >= STRANGER_CUSTOMER_GOAL && !progress.economics?.self_sustaining) {
    return {
      change_dimension: 'economics',
      reason: 'Demand is repeatable, but measured revenue has not yet exceeded measured agent operating cost. Improve margin or reduce automation cost.',
      success_metric: 'revenue_cents'
    };
  }
  return {
    change_dimension: 'scale',
    reason: 'Demand and economics are working. Scale the proven path gradually without changing multiple variables at once.',
    success_metric: 'stranger_customers'
  };
}

export function buildLearningDecision(ledger = {}, signals = {}, progress = {}) {
  const diagnosis = dimensionForSignals(signals, progress);
  const currentDecision = ledger.decision || {};
  const shouldAdapt = progress.economics?.budget_exhausted
    || progress.stalled_cycles >= numberOrZero(ledger.policy?.adapt_after_cycles || DEFAULT_ADAPT_AFTER_CYCLES)
    || ['stranger-dollar', 'repeatable-demand'].includes(progress.milestone);
  return {
    experiment_id: shouldAdapt ? `adaptive-${diagnosis.change_dimension}` : (currentDecision.experiment_id || 'free-page-conversion-baseline'),
    reason: shouldAdapt ? diagnosis.reason : (currentDecision.reason || diagnosis.reason),
    change_dimension: shouldAdapt ? diagnosis.change_dimension : (currentDecision.change_dimension || 'measurement'),
    success_metric: shouldAdapt ? diagnosis.success_metric : (currentDecision.success_metric || 'qualified_leads'),
    one_variable_rule: 'Change one meaningful variable per experiment; hold the rest constant long enough to measure.',
    should_adapt: Boolean(shouldAdapt),
    autonomy_level: progress.autonomy?.level || 0
  };
}

export function createLearningLedger() {
  const currentSignals = normalizeSignals();
  const budget = { weekly_budget_cents: DEFAULT_WEEKLY_BUDGET_CENTS };
  const progress = buildLearningProgress(currentSignals, {}, budget);
  return {
    schema_version: 2,
    primary_metric: 'stranger_revenue_cents',
    current_signals: currentSignals,
    budget,
    policy: {
      adapt_after_cycles: DEFAULT_ADAPT_AFTER_CYCLES,
      stranger_customer_goal: STRANGER_CUSTOMER_GOAL
    },
    progress,
    backlog: rankBacklog(DEFAULT_BACKLOG),
    outcomes: [],
    decision: {
      experiment_id: 'free-page-conversion-baseline',
      reason: 'Establish a real funnel baseline before automatically changing copy or outreach.',
      change_dimension: 'measurement',
      success_metric: 'qualified_leads',
      one_variable_rule: 'Change one meaningful variable per experiment; hold the rest constant long enough to measure.',
      should_adapt: false,
      autonomy_level: 0
    },
    guardrails: {
      auto_execute: ['research artifacts', 'measurement updates', 'internal documentation'],
      approval_required: ['prospect outreach', 'pricing', 'billing', 'credentials', 'deployment', 'auth'],
      provenance_rule: 'Founder and friend payments are useful tests, but only unrelated buyers count toward stranger validation.',
      budget_rule: 'Do not increase paid activity after the measured weekly budget is exhausted.'
    }
  };
}

function hasMeaningfulProgress(delta = {}, successMetric = '') {
  const keys = new Set([...PROGRESS_KEYS, String(successMetric || '').trim()].filter(Boolean));
  return [...keys].some(key => numberOrZero(delta[key]) > 0);
}

export function applyMeasurement(ledger = createLearningLedger(), measurement = {}, options = {}) {
  const previous = normalizeSignals(ledger.current_signals);
  const current = normalizeSignals({ ...previous, ...(measurement.signals || measurement) });
  const delta = Object.fromEntries(SIGNAL_KEYS.map(key => [key, current[key] - previous[key]]));
  const signalsChanged = SIGNAL_KEYS.some(key => delta[key] !== 0);
  const recordObservation = Boolean(options.recordObservation || measurement.record_observation || measurement.recordObservation);
  if (!signalsChanged && !recordObservation) return { changed: false, ledger };

  const priorStalledCycles = numberOrZero(ledger.progress?.stalled_cycles);
  const stalledCycles = hasMeaningfulProgress(delta, ledger.decision?.success_metric) ? 0 : priorStalledCycles + 1;
  const progress = buildLearningProgress(current, { ...ledger.progress, stalled_cycles: stalledCycles }, ledger.budget || {});
  progress.stalled_cycles = stalledCycles;
  progress.autonomy = buildAutonomy(progress);

  const outcome = {
    observed_at: String(measurement.observed_at || measurement.observedAt || new Date().toISOString()),
    experiment_id: measurement.experiment_id || measurement.experimentId || ledger.decision?.experiment_id || 'unattributed',
    source: measurement.source || 'manual-import',
    signals: current,
    delta,
    milestone: progress.milestone,
    stalled_cycles: stalledCycles,
    note: String(measurement.note || '').slice(0, 500)
  };

  const nextBase = {
    ...ledger,
    schema_version: 2,
    current_signals: current,
    progress,
    backlog: rankBacklog(ledger.backlog || []),
    outcomes: [...(ledger.outcomes || []), outcome].slice(-90)
  };
  const decision = buildLearningDecision(nextBase, current, progress);
  return {
    changed: true,
    signalsChanged,
    observationRecorded: true,
    ledger: { ...nextBase, decision },
    outcome
  };
}

export function applyEvidence(ledger = createLearningLedger(), evidence = {}, options = {}) {
  const measurement = applyMeasurement(ledger, evidence, options);
  let next = measurement.ledger;
  const researchChanged = Boolean(evidence.research?.fingerprint && evidence.research.fingerprint !== ledger.research?.fingerprint);
  if (researchChanged) {
    const backlog = [...(next.backlog || [])];
    if (evidence.experiment) {
      const existingIndex = backlog.findIndex(item => item.id === evidence.experiment.id);
      if (existingIndex >= 0) backlog[existingIndex] = evidence.experiment;
      else backlog.push(evidence.experiment);
    }
    next = { ...next, research: evidence.research, backlog: rankBacklog(backlog) };
  }
  const comparableSources = sources => Object.fromEntries(Object.entries(sources || {}).map(([key, value]) => {
    const { run_id: ignoredRunId, ...stable } = value || {};
    return [key, stable];
  }));
  const sourcesChanged = Boolean(evidence.sources && JSON.stringify(comparableSources(evidence.sources)) !== JSON.stringify(comparableSources(ledger.sources)));
  if (measurement.changed || researchChanged || sourcesChanged) next = { ...next, sources: evidence.sources || {} };
  return {
    changed: measurement.changed || researchChanged || sourcesChanged,
    signalsChanged: Boolean(measurement.signalsChanged),
    ledger: next,
    outcome: measurement.outcome,
    researchChanged,
    sourcesChanged,
    observationRecorded: Boolean(measurement.observationRecorded)
  };
}

export { DEFAULT_BACKLOG };

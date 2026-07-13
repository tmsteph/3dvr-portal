const DEFAULT_BACKLOG = [
  { id: 'free-page-conversion-baseline', title: 'Measure the Free Page visit-to-lead conversion rate', hypothesis: 'A visible baseline will expose the highest-leverage funnel bottleneck.', metric: 'qualified_leads', confidence: 0.9, effort: 1, risk: 'GREEN', status: 'ready' },
  { id: 'buyer-language-research', title: 'Research recurring buyer language for one narrow service niche', hypothesis: 'Using the buyer’s own pain language will improve qualified replies.', metric: 'qualified_replies', confidence: 0.75, effort: 2, risk: 'GREEN', status: 'research' },
  { id: 'free-page-proof-test', title: 'Test one proof-focused Free Page message', hypothesis: 'Concrete proof will convert more qualified visitors than broad claims.', metric: 'qualified_leads', confidence: 0.65, effort: 2, risk: 'YELLOW', status: 'blocked-on-baseline' }
];

export const SIGNAL_KEYS = ['visits', 'signups', 'qualified_leads', 'outreach_sent', 'qualified_replies', 'calls_booked', 'customers', 'revenue_cents'];

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

export function createLearningLedger() {
  return {
    schema_version: 1,
    primary_metric: 'revenue_cents',
    current_signals: normalizeSignals(),
    backlog: rankBacklog(DEFAULT_BACKLOG),
    outcomes: [],
    decision: { experiment_id: 'free-page-conversion-baseline', reason: 'Establish a real funnel baseline before automatically changing copy or outreach.' },
    guardrails: {
      auto_execute: ['research artifacts', 'measurement updates', 'internal documentation'],
      approval_required: ['prospect outreach', 'pricing', 'billing', 'credentials', 'deployment', 'auth']
    }
  };
}

export function applyMeasurement(ledger = createLearningLedger(), measurement = {}) {
  const previous = normalizeSignals(ledger.current_signals);
  const current = normalizeSignals({ ...previous, ...(measurement.signals || measurement) });
  const changed = SIGNAL_KEYS.some(key => current[key] !== previous[key]);
  if (!changed) return { changed: false, ledger };

  const outcome = {
    observed_at: String(measurement.observed_at || measurement.observedAt || new Date().toISOString()),
    experiment_id: measurement.experiment_id || measurement.experimentId || ledger.decision?.experiment_id || 'unattributed',
    source: measurement.source || 'manual-import',
    signals: current,
    delta: Object.fromEntries(SIGNAL_KEYS.map(key => [key, current[key] - previous[key]])),
    note: String(measurement.note || '').slice(0, 500)
  };
  return {
    changed: true,
    ledger: { ...ledger, current_signals: current, backlog: rankBacklog(ledger.backlog || []), outcomes: [...(ledger.outcomes || []), outcome].slice(-90) },
    outcome
  };
}

export { DEFAULT_BACKLOG };

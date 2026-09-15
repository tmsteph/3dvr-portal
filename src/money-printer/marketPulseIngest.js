import { refreshMoneyPrinterState } from './moneyPrinterCore.js';

function clean(value = '') {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function emptyTraction() {
  return {
    leads_found: 0,
    messages_drafted: 0,
    messages_sent: 0,
    replies: 0,
    calls_booked: 0,
    revenue: 0,
  };
}

export function parseMarketPulseCapsuleRecord(record = {}) {
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
    candidates,
  };
}

export function marketPulseCandidateToExperiment(candidate = {}) {
  const capsule = candidate.capsule && typeof candidate.capsule === 'object'
    ? candidate.capsule
    : {};
  const id = clean(capsule.sourceId) || `experiment-market-pulse-${clean(candidate.id) || 'candidate'}`;
  return {
    id,
    name: clean(candidate.title) || 'Market Pulse opportunity',
    customer: clean(candidate.buyer || capsule.buyer),
    pain: clean(candidate.pain),
    offer: clean(candidate.offer || capsule.offer),
    price_test: clean(candidate.suggestedPrice) || (number(capsule.priceCents) > 0 ? `$${Math.round(number(capsule.priceCents) / 100)}` : 'Price test pending'),
    validation_test: 'Review the Market Pulse evidence, choose the smallest reversible validation step, and keep external contact approval-gated.',
    status: 'Idea',
    priorityScore: number(capsule.priorityScore, 50),
    capsule: {
      ...capsule,
      sourceId: id,
      status: 'queued',
      budgetCapCents: 0,
      policy: {
        ...(capsule.policy || {}),
        maxAutomatedSpendCents: 0,
        externalWrites: 'approval-required',
        irreversibleActions: 'approval-required',
      },
    },
    traction: emptyTraction(),
    next_action: 'Review evidence and run the smallest approval-gated validation step.',
    marketPulse: {
      candidateId: clean(candidate.id),
      sourceRunId: clean(candidate.sourceRunId),
      sourceOpportunityId: clean(candidate.sourceOpportunityId),
      evidence: Array.isArray(candidate.evidence) ? candidate.evidence.filter(Boolean) : [],
      marketScore: number(candidate.marketScore),
      profitScore: number(candidate.profitScore),
      publicAlignmentScore: number(candidate.publicAlignmentScore, number(candidate.alignmentScore)),
      alignmentScore: number(candidate.alignmentScore),
      alignmentProfileSource: clean(candidate.alignmentProfileSource),
      fulfillmentScore: number(candidate.fulfillmentScore),
    },
  };
}

function isTerminalExperiment(experiment = {}) {
  return ['Killed', 'Revenue', 'Scaling'].includes(experiment.status)
    || ['killed', 'won', 'expired'].includes(clean(experiment.capsule?.status).toLowerCase());
}

export function ingestMarketPulseCapsuleCandidates(state = {}, payload = {}) {
  const runId = clean(payload.runId);
  const personalizationKey = clean(payload.personalizationKey);
  const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
  const sameRun = Boolean(runId && state.marketPulseLastImportedRunId === runId);
  const samePersonalization = clean(state.marketPulseLastPersonalizationKey) === personalizationKey;
  if (sameRun && samePersonalization) {
    return {
      state: refreshMoneyPrinterState(state),
      imported: 0,
      updated: 0,
      skipped: true,
      reason: 'already imported',
    };
  }

  const incoming = candidates.map(marketPulseCandidateToExperiment);
  const existing = Array.isArray(state.experiments) ? state.experiments : [];
  const byId = new Map(existing.map((experiment) => [experiment.id, experiment]));
  let imported = 0;
  let updated = 0;

  incoming.forEach((candidateExperiment) => {
    const current = byId.get(candidateExperiment.id);
    if (!current) {
      byId.set(candidateExperiment.id, candidateExperiment);
      imported += 1;
      return;
    }
    if (isTerminalExperiment(current)) return;

    byId.set(candidateExperiment.id, {
      ...current,
      priorityScore: candidateExperiment.priorityScore,
      capsule: {
        ...(current.capsule || {}),
        ...candidateExperiment.capsule,
        sourceId: candidateExperiment.id,
        status: current.capsule?.status || 'queued',
        priorityScore: candidateExperiment.priorityScore,
        updatedAt: candidateExperiment.capsule.updatedAt || current.capsule?.updatedAt,
        budgetCapCents: 0,
        policy: {
          ...(current.capsule?.policy || {}),
          ...(candidateExperiment.capsule.policy || {}),
          maxAutomatedSpendCents: 0,
          externalWrites: 'approval-required',
          irreversibleActions: 'approval-required',
        },
      },
      marketPulse: candidateExperiment.marketPulse,
    });
    updated += 1;
  });

  const nextState = refreshMoneyPrinterState({
    ...state,
    experiments: [...byId.values()],
    marketPulseLastImportedRunId: runId || state.marketPulseLastImportedRunId || '',
    marketPulseLastImportedAt: clean(payload.generatedAt) || state.marketPulseLastImportedAt || new Date().toISOString(),
    marketPulseLastPersonalizationKey: personalizationKey,
  });

  return {
    state: nextState,
    imported,
    updated,
    skipped: false,
  };
}

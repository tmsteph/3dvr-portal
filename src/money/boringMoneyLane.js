function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function text(value, fallback = '') {
  return String(value ?? fallback).trim();
}

function clampScore(value, fallback = 50) {
  return Math.min(100, Math.max(0, Math.round(number(value, fallback))));
}

function normalizeChannels(channels = []) {
  const values = Array.isArray(channels) ? channels : String(channels || '').split(',');
  return [...new Set(values.map(item => text(item).toLowerCase()).filter(Boolean))].slice(0, 5);
}

export function scoreBoringMoneyOpportunity(opportunity = {}) {
  const painScore = clampScore(opportunity.painScore);
  const willingnessToPay = clampScore(opportunity.willingnessToPay);
  const speedToBuild = clampScore(opportunity.speedToBuild);
  const competitionGap = clampScore(opportunity.competitionGap);

  // Boring money favors obvious pain, proven willingness to pay, and fast/manual delivery.
  // Novelty is intentionally a minor input; this lane exists to find dependable cash flow.
  return clampScore(
    painScore * 0.35
      + willingnessToPay * 0.3
      + speedToBuild * 0.25
      + competitionGap * 0.1,
    0
  );
}

function buildOffer(opportunity = {}) {
  const audience = text(opportunity.audience, 'a clearly defined buyer');
  const solution = text(opportunity.solution, 'a small, manual-first service that solves the immediate problem');
  const problem = text(opportunity.problem, 'an urgent, expensive problem');

  return {
    name: text(opportunity.title, 'Tiny paid pilot'),
    audience,
    problem,
    promise: solution,
    delivery: text(opportunity.mvp, 'Deliver the smallest useful result manually before building software.'),
    priceAnchor: text(opportunity.suggestedPrice, '$99 pilot')
  };
}

export function buildBoringMoneyLane(opportunities = [], options = {}) {
  const channels = normalizeChannels(options.channels);
  const ranked = (Array.isArray(opportunities) ? opportunities : [])
    .filter(item => item && typeof item === 'object' && item.positiveSumEligible !== false)
    .map(item => ({
      ...item,
      boringMoneyScore: scoreBoringMoneyOpportunity(item)
    }))
    .sort((left, right) => right.boringMoneyScore - left.boringMoneyScore);

  const candidate = ranked[0] || null;
  if (!candidate) {
    return {
      id: 'boring-money',
      status: 'empty',
      thesis: 'Solve obvious paid pain with the smallest sellable service before building software.',
      candidate: null,
      nextActions: ['Collect demand evidence from approved sources.'],
      maxAutomaticSpendUsd: 0
    };
  }

  const offer = buildOffer(candidate);
  const ready = candidate.boringMoneyScore >= 65
    && clampScore(candidate.painScore) >= 60
    && clampScore(candidate.willingnessToPay) >= 55
    && clampScore(candidate.speedToBuild) >= 55;

  return {
    id: 'boring-money',
    status: ready ? 'ready-for-bounded-test' : 'research',
    thesis: 'Solve obvious paid pain with the smallest sellable service before building software.',
    candidate,
    offer,
    landingPage: {
      headline: `${offer.name}: ${offer.promise}`,
      subhead: `For ${offer.audience}. Start with a small paid pilot focused on ${offer.problem}.`,
      cta: 'Request a paid pilot',
      proofNeeded: Array.isArray(candidate.evidence) ? candidate.evidence.filter(Boolean).slice(0, 3) : []
    },
    outreach: {
      audience: offer.audience,
      channels,
      listBrief: `Build a small, permission-respecting list of ${offer.audience} who show evidence of this problem.`,
      sendAutomatically: false,
      permission: 'approval-required'
    },
    experiment: {
      type: 'manual-first-paid-pilot',
      durationHours: 48,
      maxAutomaticSpendUsd: 0,
      successCriteria: [
        'At least one paid pilot, or',
        'At least three qualified buyers explicitly ask to continue the conversation.'
      ],
      requiresApproval: ['publish', 'external-contact', 'spend']
    },
    nextActions: [
      'Turn the candidate into one concrete paid offer.',
      'Prepare the one-page landing copy and checkout/intake path as drafts.',
      'Prepare a small target-list brief from approved demand evidence.',
      'Run the bounded test only after required external-action approvals.'
    ],
    maxAutomaticSpendUsd: 0
  };
}

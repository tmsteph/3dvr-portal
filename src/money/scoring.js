const DEFAULT_WEIGHTS = {
  painScore: 0.34,
  willingnessToPay: 0.3,
  speedToBuild: 0.2,
  competitionGap: 0.16
};

function clampScore(value, fallback = 50) {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function toId(value, prefix = 'idea') {
  const base = typeof value === 'string' ? value : String(value || '');
  const slug = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

function titleCase(value = '') {
  return String(value)
    .split(/\s+/)
    .filter(Boolean)
    .map(word => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`)
    .join(' ');
}

export function scoreOpportunity(opportunity = {}, weights = DEFAULT_WEIGHTS) {
  const normalized = {
    ...opportunity,
    id: opportunity.id || toId(opportunity.title || opportunity.problem || 'opportunity'),
    title: opportunity.title || 'Untitled opportunity',
    problem: opportunity.problem || 'Pain point needs clarification',
    audience: opportunity.audience || 'Underserved buyer segment',
    solution: opportunity.solution || 'MVP proposal pending',
    mvp: opportunity.mvp || 'Ship a single-page workflow and collect usage data',
    suggestedPrice: opportunity.suggestedPrice || '$19/mo starter',
    painScore: clampScore(opportunity.painScore, 55),
    willingnessToPay: clampScore(opportunity.willingnessToPay, 52),
    speedToBuild: clampScore(opportunity.speedToBuild, 60),
    competitionGap: clampScore(opportunity.competitionGap, 48),
    evidence: Array.isArray(opportunity.evidence) ? opportunity.evidence.filter(Boolean) : []
  };

  const score = (
    normalized.painScore * (weights.painScore ?? DEFAULT_WEIGHTS.painScore)
    + normalized.willingnessToPay * (weights.willingnessToPay ?? DEFAULT_WEIGHTS.willingnessToPay)
    + normalized.speedToBuild * (weights.speedToBuild ?? DEFAULT_WEIGHTS.speedToBuild)
    + normalized.competitionGap * (weights.competitionGap ?? DEFAULT_WEIGHTS.competitionGap)
  );

  return {
    ...normalized,
    score: Math.round(score * 10) / 10
  };
}

export function rankOpportunities(opportunities = [], weights = DEFAULT_WEIGHTS) {
  return opportunities
    .map(item => scoreOpportunity(item, weights))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return right.painScore - left.painScore;
    });
}

export function deriveOpportunityFromSignal(signal = {}, index = 0, market = 'founders') {
  const keyword = String(signal.keyword || market)
    .replace(/[-_]+/g, ' ')
    .trim();
  const title = signal.title || `Recurring pain in ${market}`;
  const popularity = clampScore(signal.popularity, 30);
  const comments = clampScore(signal.comments, 25);
  const urgency = Math.max(40, Math.min(95, popularity + Math.round(comments * 0.3)));

  return {
    id: `${toId(`${keyword}-${index + 1}`, 'signal')}-${index + 1}`,
    title: `${titleCase(keyword || 'workflow')} automation for ${market}`.slice(0, 96),
    problem: `${market} teams repeatedly lose time on ${keyword || 'this workflow'} and need a faster process.`,
    audience: market,
    solution: `Automate ${keyword || 'the workflow'} using templates, reminders, and one-click follow-up actions.`,
    mvp: 'Landing page + onboarding form + simple automation result page',
    suggestedPrice: '$29/mo plus setup',
    painScore: urgency,
    willingnessToPay: Math.max(35, Math.min(90, popularity)),
    speedToBuild: 68,
    competitionGap: Math.max(35, Math.min(85, 75 - Math.round(popularity * 0.25))),
    evidence: [
      signal.source ? `${signal.source}: ${signal.title || 'signal'}` : title,
      signal.url || '',
      signal.summary || ''
    ].filter(Boolean)
  };
}

export function buildAdDrafts(opportunities = [], channels = []) {
  const channelList = Array.isArray(channels) && channels.length
    ? channels
    : ['reddit', 'x', 'linkedin'];

  return opportunities.slice(0, 3).flatMap(opportunity => {
    return channelList.map(channel => ({
      id: `${opportunity.id}-${channel}`,
      channel,
      headline: `${opportunity.problem.slice(0, 60)}?`,
      body: `${opportunity.solution} Start with ${opportunity.suggestedPrice}.`,
      cta: `Try the ${opportunity.title.slice(0, 48)} beta`,
      linkedOpportunityId: opportunity.id
    }));
  });
}

import { evaluatePositiveSum } from '../kernel/positiveSum.js';

export const OPPORTUNITY_SEARCH_MODES = Object.freeze(['aligned', 'profit', 'portfolio']);

const DEFAULT_WEIGHTS = Object.freeze({
  painScore: 0.34,
  willingnessToPay: 0.3,
  speedToBuild: 0.2,
  competitionGap: 0.16
});

const MODE_WEIGHTS = Object.freeze({
  aligned: Object.freeze({ market: 0.35, profit: 0.15, alignment: 0.35, fulfillment: 0.15 }),
  profit: Object.freeze({ market: 0.3, profit: 0.45, alignment: 0.05, fulfillment: 0.2 }),
  portfolio: Object.freeze({ market: 0.4, profit: 0.3, alignment: 0.15, fulfillment: 0.15 })
});

function clampScore(value, fallback = 50) {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function roundScore(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

function toId(value, prefix = 'idea') {
  const base = typeof value === 'string' ? value : String(value || '');
  const slug = base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return slug || `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

function titleCase(value = '') {
  return String(value).split(/\s+/).filter(Boolean)
    .map(word => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`).join(' ');
}

export function normalizeOpportunitySearchMode(value = 'portfolio') {
  const mode = String(value || '').trim().toLowerCase();
  return OPPORTUNITY_SEARCH_MODES.includes(mode) ? mode : 'portfolio';
}

export function scoreOpportunity(opportunity = {}, weights = DEFAULT_WEIGHTS, searchMode = 'portfolio') {
  const mode = normalizeOpportunitySearchMode(searchMode || opportunity.searchMode);
  const positiveSum = evaluatePositiveSum(opportunity);
  const normalized = {
    ...opportunity,
    ...positiveSum,
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
    alignmentScore: clampScore(opportunity.alignmentScore, 50),
    fulfillmentScore: clampScore(opportunity.fulfillmentScore, opportunity.speedToBuild ?? 60),
    evidence: Array.isArray(opportunity.evidence) ? opportunity.evidence.filter(Boolean) : []
  };

  const marketScore = (
    normalized.painScore * (weights.painScore ?? DEFAULT_WEIGHTS.painScore)
    + normalized.willingnessToPay * (weights.willingnessToPay ?? DEFAULT_WEIGHTS.willingnessToPay)
    + normalized.speedToBuild * (weights.speedToBuild ?? DEFAULT_WEIGHTS.speedToBuild)
    + normalized.competitionGap * (weights.competitionGap ?? DEFAULT_WEIGHTS.competitionGap)
  );
  const derivedProfitScore = (
    normalized.willingnessToPay * 0.4
    + normalized.speedToBuild * 0.2
    + normalized.competitionGap * 0.15
    + normalized.painScore * 0.15
    + normalized.fulfillmentScore * 0.1
  );
  const explicitProfitScore = Number(opportunity.profitScore);
  const profitScore = Number.isFinite(explicitProfitScore)
    ? clampScore(explicitProfitScore)
    : roundScore(derivedProfitScore);
  const dimensions = {
    market: roundScore(marketScore),
    profit: profitScore,
    alignment: normalized.alignmentScore,
    fulfillment: normalized.fulfillmentScore
  };
  const blend = MODE_WEIGHTS[mode];
  const economicScore = roundScore(
    dimensions.market * blend.market
    + dimensions.profit * blend.profit
    + dimensions.alignment * blend.alignment
    + dimensions.fulfillment * blend.fulfillment
  );
  const score = positiveSum.positiveSumEligible ? economicScore : 0;

  return {
    ...normalized,
    searchMode: mode,
    marketScore: dimensions.market,
    profitScore: dimensions.profit,
    alignmentScore: dimensions.alignment,
    fulfillmentScore: dimensions.fulfillment,
    economicScore,
    score
  };
}

export function rankOpportunities(opportunities = [], weights = DEFAULT_WEIGHTS, searchMode = 'portfolio') {
  return opportunities
    .map(item => scoreOpportunity(item, weights, searchMode))
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      if (right.profitScore !== left.profitScore) return right.profitScore - left.profitScore;
      return right.painScore - left.painScore;
    });
}

export function deriveOpportunityFromSignal(signal = {}, index = 0, market = 'founders') {
  const keyword = String(signal.keyword || market).replace(/[-_]+/g, ' ').trim();
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
    alignmentScore: clampScore(signal.alignmentScore, 50),
    fulfillmentScore: clampScore(signal.fulfillmentScore, 68),
    agencyScore: clampScore(signal.agencyScore, 50),
    sharedValueScore: clampScore(signal.sharedValueScore, 50),
    opennessScore: clampScore(signal.opennessScore, 50),
    harmRiskScore: clampScore(signal.harmRiskScore, 0),
    lockInRiskScore: clampScore(signal.lockInRiskScore, 0),
    ...(Number.isFinite(Number(signal.profitScore)) ? { profitScore: clampScore(signal.profitScore) } : {}),
    evidence: [
      signal.source ? `${signal.source}: ${signal.title || 'signal'}` : title,
      signal.url || '',
      signal.summary || ''
    ].filter(Boolean)
  };
}

export function buildAdDrafts(opportunities = [], channels = []) {
  const channelList = Array.isArray(channels) && channels.length ? channels : ['reddit', 'x', 'linkedin'];
  return opportunities.slice(0, 3).flatMap(opportunity => channelList.map(channel => ({
    id: `${opportunity.id}-${channel}`,
    channel,
    headline: `${opportunity.problem.slice(0, 60)}?`,
    body: `${opportunity.solution} Start with ${opportunity.suggestedPrice}.`,
    cta: `Try the ${opportunity.title.slice(0, 48)} beta`,
    linkedOpportunityId: opportunity.id
  })));
}

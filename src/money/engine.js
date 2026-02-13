import { buildAdDrafts, deriveOpportunityFromSignal, rankOpportunities } from './scoring.js';
import { collectDemandSignals } from './sources.js';
import { createOpenAiMoneyClient, DEFAULT_OPENAI_MODEL } from './openai.js';

function makeRunId(now = new Date()) {
  const stamp = now.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const random = Math.random().toString(36).slice(2, 8);
  return `money-${stamp}-${random}`;
}

function normalizeInput(raw = {}) {
  const market = typeof raw.market === 'string' && raw.market.trim()
    ? raw.market.trim()
    : 'solo founders and creator businesses';

  const keywords = Array.isArray(raw.keywords)
    ? raw.keywords.map(item => String(item || '').trim()).filter(Boolean)
    : String(raw.keywords || '')
      .split(',')
      .map(item => item.trim())
      .filter(Boolean);

  const channels = Array.isArray(raw.channels)
    ? raw.channels.map(item => String(item || '').trim().toLowerCase()).filter(Boolean)
    : String(raw.channels || 'reddit,x,linkedin')
      .split(',')
      .map(item => item.trim().toLowerCase())
      .filter(Boolean);

  const budget = typeof raw.budget === 'number'
    ? raw.budget
    : Number(String(raw.budget || '').replace(/[^\d.]/g, ''));

  return {
    market,
    keywords,
    channels: channels.length ? channels.slice(0, 5) : ['reddit', 'x', 'linkedin'],
    budget: Number.isFinite(budget) && budget >= 0 ? budget : 150,
    limit: Number.isFinite(raw.limit) ? raw.limit : 24
  };
}

function fallbackOpportunities(signals = [], market = '') {
  if (!signals.length) {
    return [
      {
        title: `Ops co-pilot for ${market}`,
        problem: `${market} teams lose time to repetitive support and follow-up work.`,
        audience: market,
        solution: 'A simple AI operator that drafts replies, updates CRM notes, and schedules reminders.',
        mvp: 'Landing page + intake form + one automation action delivered by email in under 10 minutes.',
        suggestedPrice: '$39/mo',
        painScore: 72,
        willingnessToPay: 66,
        speedToBuild: 74,
        competitionGap: 52,
        evidence: ['Fallback opportunity generated without external demand signals.']
      }
    ];
  }

  return signals.slice(0, 8).map((signal, index) => deriveOpportunityFromSignal(signal, index, market));
}

function buildExecutionChecklist(topOpportunity, channels) {
  if (!topOpportunity) {
    return [];
  }

  return [
    `Ship a one-page offer for "${topOpportunity.title}" with one CTA to start a paid trial.`,
    'Connect Stripe Checkout with a single starter offer and clear refund policy.',
    'Run 3 ad variants for 48 hours and track CPC, signup rate, and paid conversions.',
    `Prioritize channels: ${channels.join(', ')}.`,
    'Interview the first 5 paying users and rewrite the landing page from their wording.'
  ];
}

function sanitizeOpportunityList(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter(item => item && typeof item === 'object')
    .map(item => ({
      id: item.id,
      title: item.title,
      problem: item.problem,
      audience: item.audience,
      solution: item.solution,
      mvp: item.mvp,
      suggestedPrice: item.suggestedPrice,
      painScore: item.painScore,
      willingnessToPay: item.willingnessToPay,
      speedToBuild: item.speedToBuild,
      competitionGap: item.competitionGap,
      evidence: Array.isArray(item.evidence) ? item.evidence.filter(Boolean) : []
    }));
}

function sanitizeAdDrafts(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(item => item && typeof item === 'object')
    .map((item, index) => ({
      id: item.id || `ai-ad-${index + 1}`,
      channel: String(item.channel || 'reddit').toLowerCase(),
      headline: String(item.headline || '').trim(),
      body: String(item.body || '').trim(),
      cta: String(item.cta || 'Start your pilot').trim(),
      linkedOpportunityId: item.linkedOpportunityId || ''
    }))
    .filter(item => item.headline && item.body);
}

function dedupeOpportunities(opportunities = []) {
  const seen = new Set();
  const unique = [];

  opportunities.forEach(item => {
    const key = `${item.title || ''}|${item.problem || ''}`.toLowerCase().trim();
    if (!key || seen.has(key)) {
      return;
    }
    seen.add(key);
    unique.push(item);
  });

  return unique;
}

export async function runMoneyLoop(input = {}, options = {}) {
  const now = typeof options.now === 'function' ? options.now : () => new Date();
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const normalizedInput = normalizeInput(input);

  const runId = input.runId || makeRunId(now());
  const generatedAt = now().toISOString();

  const demand = await collectDemandSignals({
    ...normalizedInput,
    fetchImpl
  });

  const warnings = [...demand.warnings];
  const openAiApiKey = input.openAiApiKey
    || options.openAiApiKey
    || process.env.OPENAI_API_KEY
    || '';
  const openAiModel = input.openAiModel
    || options.openAiModel
    || process.env.OPENAI_MODEL
    || DEFAULT_OPENAI_MODEL;

  let aiResult = null;

  if (openAiApiKey) {
    try {
      const client = createOpenAiMoneyClient({
        apiKey: openAiApiKey,
        model: openAiModel,
        fetchImpl
      });
      aiResult = await client.synthesize({
        market: normalizedInput.market,
        budget: normalizedInput.budget,
        channels: normalizedInput.channels,
        keywords: demand.keywords,
        signals: demand.signals
      });
    } catch (error) {
      warnings.push(error?.message || 'OpenAI synthesis failed.');
    }
  }

  const aiOpportunities = sanitizeOpportunityList(aiResult?.opportunities);
  const rankedOpportunities = rankOpportunities(
    aiOpportunities.length ? aiOpportunities : fallbackOpportunities(demand.signals, normalizedInput.market)
  );
  const opportunities = dedupeOpportunities(rankedOpportunities).slice(0, 6);

  const topOpportunity = opportunities[0] || null;
  const aiAds = sanitizeAdDrafts(aiResult?.adDrafts);
  const adDrafts = aiAds.length
    ? aiAds
    : buildAdDrafts(opportunities, normalizedInput.channels);

  const checklist = buildExecutionChecklist(topOpportunity, normalizedInput.channels);

  const revenueEstimate = topOpportunity
    ? {
      lowMonthly: Math.round(normalizedInput.budget * 1.8),
      highMonthly: Math.round(normalizedInput.budget * 4.5),
      assumptions: [
        '2-5 paid conversions from first 100 targeted visitors.',
        `Starter pricing around ${topOpportunity.suggestedPrice}.`,
        'Manual onboarding during week one to reduce churn.'
      ]
    }
    : null;

  return {
    runId,
    generatedAt,
    usedOpenAi: Boolean(aiResult),
    input: normalizedInput,
    warnings,
    signals: demand.signals,
    opportunities,
    topOpportunity,
    adDrafts,
    executionChecklist: checklist,
    monetization: {
      pricingAnchor: topOpportunity?.suggestedPrice || '$29/mo',
      stripe: {
        recommendation: 'Use one Stripe price for starter monthly plan and measure checkout completion daily.',
        requiredEnv: ['STRIPE_SECRET_KEY', 'STRIPE_PRICE_ID']
      },
      revenueEstimate
    },
    monetizationNotes: Array.isArray(aiResult?.monetizationNotes)
      ? aiResult.monetizationNotes.filter(Boolean)
      : []
  };
}

import { runMoneyLoop } from './engine.js';
import { collectDemandSignals } from './sources.js';

const DEFAULT_AUTOPILOT_PROFILE = {
  market: 'freelancers managing outreach and follow-up',
  keywords: ['lead follow-up', 'proposal workflow', 'client onboarding'],
  channels: ['reddit', 'x', 'linkedin', 'email', 'google-ads'],
  budget: 150,
  limit: 24,
  maxBudget: 300,
  autoDiscover: true,
  discoverySeeds: ['freelance', 'small business', 'automation', 'client onboarding', 'lead follow up'],
  publishPathPrefix: 'money-ai/offers'
};

const MARKET_PROFILES = [
  {
    market: 'freelancers and small agencies',
    tokens: ['freelance', 'agency', 'client', 'proposal', 'outreach', 'consulting', 'contractor']
  },
  {
    market: 'local home service businesses',
    tokens: ['plumber', 'hvac', 'roofing', 'cleaning', 'landscaping', 'contractor', 'local']
  },
  {
    market: 'ecommerce store operators',
    tokens: ['shopify', 'ecommerce', 'checkout', 'cart', 'order', 'inventory', 'store']
  },
  {
    market: 'coaches and online creators',
    tokens: ['creator', 'newsletter', 'audience', 'course', 'coaching', 'community', 'subscriber']
  },
  {
    market: 'software startups and saas teams',
    tokens: ['saas', 'startup', 'onboarding', 'trial', 'churn', 'crm', 'support']
  }
];

const IGNORED_TERMS = new Set([
  'www',
  'com',
  'the',
  'and',
  'for',
  'with',
  'from',
  'that',
  'this',
  'your',
  'team',
  'about',
  'into',
  'over',
  'under',
  'just',
  'then',
  'have',
  'been',
  'were',
  'where',
  'when',
  'why',
  'what',
  'how',
  'using',
  'used',
  'than',
  'more',
  'less',
  'will',
  'could',
  'should',
  'would',
  'into',
  'many',
  'some',
  'much',
  'their',
  'they',
  'them',
  'ours',
  'ourselves',
  'because',
  'about',
  'https',
  'http',
  'index',
  'html'
]);

const NOISY_DISCOVERY_SINGLE_TERMS = new Set([
  'agency',
  'client',
  'automation',
  'business'
]);

function parseCsvList(value) {
  if (!value || typeof value !== 'string') {
    return [];
  }

  return value
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function toNumber(value, fallback) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return fallback;
  }

  const cleaned = typeof value === 'number'
    ? value
    : Number(String(value).replace(/[^\d.]/g, ''));

  if (!Number.isFinite(cleaned)) {
    return fallback;
  }

  return cleaned;
}

function parseBudget(value, fallback) {
  const numeric = toNumber(value, fallback);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return fallback;
  }
  return Math.round(numeric * 100) / 100;
}

function parseBoolean(value, fallback = false) {
  if (typeof value === 'boolean') {
    return value;
  }

  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }

  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }

  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }

  return fallback;
}

function ensureList(value, fallback = []) {
  if (Array.isArray(value) && value.length) {
    return value.map(item => String(item || '').trim()).filter(Boolean);
  }
  return Array.isArray(fallback) ? fallback.slice() : [];
}

function uniqueStrings(values = []) {
  const seen = new Set();
  const output = [];

  values.forEach(value => {
    const normalized = String(value || '').trim();
    if (!normalized) {
      return;
    }
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    output.push(normalized);
  });

  return output;
}

function sanitizeProjectName(value = '') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || 'money-autopilot-site';
}

function tokenizeText(text = '') {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s/-]/g, ' ')
    .split(/\s+/)
    .map(item => item.trim())
    .filter(item => {
      if (!item || item.length < 3) {
        return false;
      }
      if (IGNORED_TERMS.has(item)) {
        return false;
      }
      if (/^x\d+$/i.test(item)) {
        return false;
      }
      if (/^\d+$/.test(item)) {
        return false;
      }
      return true;
    });
}

function keywordScoreFromSignal(signal = {}) {
  const popularity = Number(signal.popularity) || 0;
  const comments = Number(signal.comments) || 0;
  return Math.max(1, popularity * 0.45 + comments * 0.35 + 8);
}

function deriveKeywordPool(signals = []) {
  const scoreByKeyword = new Map();

  signals.forEach(signal => {
    const weight = keywordScoreFromSignal(signal);
    const tokens = tokenizeText(`${signal.title || ''} ${signal.summary || ''}`);

    tokens.forEach(token => {
      scoreByKeyword.set(token, (scoreByKeyword.get(token) || 0) + weight);
    });
  });

  return Array.from(scoreByKeyword.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 24)
    .map(([token]) => token);
}

function sanitizeDiscoveredKeywords(keywords = [], options = {}) {
  const marketTokens = ensureList(options.marketTokens || []);
  const seedKeywords = ensureList(options.seedKeywords || []);
  const normalized = uniqueStrings(keywords);
  if (!normalized.length) {
    return [];
  }

  const allowedSingleTerms = new Set();
  marketTokens.forEach(token => {
    tokenizeText(token).forEach(term => allowedSingleTerms.add(term));
  });
  seedKeywords.forEach(keyword => {
    const terms = tokenizeText(keyword);
    if (terms.length === 1) {
      allowedSingleTerms.add(terms[0]);
    }
  });

  const phraseTerms = new Set();
  normalized.forEach(keyword => {
    const terms = tokenizeText(keyword);
    if (terms.length < 2) {
      return;
    }
    terms.forEach(term => phraseTerms.add(term));
  });

  return normalized.filter(keyword => {
    const terms = tokenizeText(keyword);
    if (!terms.length) {
      return false;
    }

    if (terms.length !== 1) {
      return true;
    }

    const term = terms[0];
    if (phraseTerms.has(term)) {
      return false;
    }

    if (NOISY_DISCOVERY_SINGLE_TERMS.has(term)) {
      return false;
    }

    if (allowedSingleTerms.size > 0 && !allowedSingleTerms.has(term)) {
      return false;
    }

    return true;
  });
}

function deriveMarketCandidates(signals = [], seedKeywords = [], analyticsKeywords = []) {
  if (!Array.isArray(signals) || signals.length === 0) {
    return [];
  }

  const candidates = MARKET_PROFILES.map(profile => ({
    market: profile.market,
    tokens: profile.tokens,
    score: 0,
    matchedKeywords: new Map(),
    evidence: []
  }));

  signals.forEach(signal => {
    const text = `${signal.title || ''} ${signal.summary || ''} ${signal.keyword || ''}`.toLowerCase();
    const weight = keywordScoreFromSignal(signal);

    candidates.forEach(candidate => {
      const matches = candidate.tokens.filter(token => text.includes(token));
      if (!matches.length) {
        return;
      }

      const matchBoost = 0.6 + matches.length / Math.max(1, candidate.tokens.length);
      candidate.score += weight * matchBoost;

      matches.forEach(token => {
        candidate.matchedKeywords.set(token, (candidate.matchedKeywords.get(token) || 0) + weight);
      });

      if (candidate.evidence.length < 6 && signal.title) {
        candidate.evidence.push(signal.title);
      }
    });
  });

  const keywordPool = deriveKeywordPool(signals);
  const analyticsBoost = new Set(ensureList(analyticsKeywords));

  return candidates
    .filter(candidate => candidate.score > 0)
    .map(candidate => {
      const rankedMatched = Array.from(candidate.matchedKeywords.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([token]) => token);

      let score = candidate.score;
      rankedMatched.forEach(keyword => {
        if (analyticsBoost.has(keyword)) {
          score += 12;
        }
      });

      const keywords = uniqueStrings([
        ...rankedMatched,
        ...analyticsKeywords,
        ...seedKeywords,
        ...keywordPool
      ]);

      return {
        market: candidate.market,
        score: Math.round(score * 10) / 10,
        keywords: sanitizeDiscoveredKeywords(keywords, {
          marketTokens: candidate.tokens,
          seedKeywords
        }).slice(0, 8),
        evidence: candidate.evidence.slice(0, 4)
      };
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, 5);
}

function parseGaKeywordHints(paths = []) {
  const terms = [];

  paths.forEach(path => {
    const segments = String(path || '')
      .split('/')
      .map(item => item.trim())
      .filter(Boolean);

    segments.forEach(segment => {
      tokenizeText(segment).forEach(token => terms.push(token));
    });
  });

  return uniqueStrings(terms).slice(0, 8);
}

async function fetchGoogleAnalyticsHints(config = {}, fetchImpl = globalThis.fetch) {
  const propertyId = String(config.gaPropertyId || '').trim();
  const accessToken = String(config.gaAccessToken || '').trim();

  if (!propertyId || !accessToken) {
    return {
      enabled: false,
      source: 'ga4',
      warnings: [],
      keywords: [],
      topPaths: [],
      topSources: []
    };
  }

  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
      dimensions: [{ name: 'sessionSourceMedium' }, { name: 'pagePath' }],
      metrics: [{ name: 'sessions' }],
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      limit: 50
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    const safe = String(errorText || '').replace(/\s+/g, ' ').slice(0, 120);
    return {
      enabled: true,
      source: 'ga4',
      warnings: [`Google Analytics unavailable (HTTP ${response.status})${safe ? `: ${safe}` : ''}`],
      keywords: [],
      topPaths: [],
      topSources: []
    };
  }

  const payload = await response.json();
  const rows = Array.isArray(payload?.rows) ? payload.rows : [];

  const topPaths = [];
  const topSources = [];

  rows.slice(0, 15).forEach(row => {
    const dimensions = Array.isArray(row?.dimensionValues) ? row.dimensionValues : [];
    const source = dimensions[0]?.value || '';
    const path = dimensions[1]?.value || '';
    if (source) topSources.push(source);
    if (path) topPaths.push(path);
  });

  return {
    enabled: true,
    source: 'ga4',
    warnings: [],
    keywords: parseGaKeywordHints(topPaths),
    topPaths: uniqueStrings(topPaths).slice(0, 8),
    topSources: uniqueStrings(topSources).slice(0, 8)
  };
}

export function resolveAutopilotConfig(options = {}) {
  const env = options.env || process.env;

  const keywords = ensureList(
    options.keywords,
    parseCsvList(env.MONEY_AUTOPILOT_KEYWORDS)
  );

  const channels = ensureList(
    options.channels,
    parseCsvList(env.MONEY_AUTOPILOT_CHANNELS)
  );

  const discoverySeeds = ensureList(
    options.discoverySeeds,
    parseCsvList(env.MONEY_AUTOPILOT_DISCOVERY_SEEDS)
  );

  const maxBudget = parseBudget(
    options.maxBudget ?? env.MONEY_AUTOPILOT_MAX_BUDGET,
    DEFAULT_AUTOPILOT_PROFILE.maxBudget
  );

  const requestedBudget = parseBudget(
    options.budget ?? env.MONEY_AUTOPILOT_WEEKLY_BUDGET,
    DEFAULT_AUTOPILOT_PROFILE.budget
  );

  const budget = Math.min(requestedBudget, maxBudget);

  return {
    market: String(
      options.market
      || env.MONEY_AUTOPILOT_MARKET
      || DEFAULT_AUTOPILOT_PROFILE.market
    ).trim(),
    keywords: (keywords.length ? keywords : DEFAULT_AUTOPILOT_PROFILE.keywords).slice(0, 8),
    channels: (channels.length ? channels : DEFAULT_AUTOPILOT_PROFILE.channels).slice(0, 5),
    discoverySeeds: (discoverySeeds.length ? discoverySeeds : DEFAULT_AUTOPILOT_PROFILE.discoverySeeds).slice(0, 8),
    autoDiscover: parseBoolean(
      options.autoDiscover ?? env.MONEY_AUTOPILOT_AUTO_DISCOVERY,
      DEFAULT_AUTOPILOT_PROFILE.autoDiscover
    ),
    budget,
    maxBudget,
    limit: Number.isFinite(options.limit)
      ? options.limit
      : Number.isFinite(Number(env.MONEY_AUTOPILOT_SIGNAL_LIMIT))
        ? Number(env.MONEY_AUTOPILOT_SIGNAL_LIMIT)
        : DEFAULT_AUTOPILOT_PROFILE.limit,
    openAiApiKey: String(options.openAiApiKey || env.OPENAI_API_KEY || '').trim(),
    openAiModel: String(options.openAiModel || env.OPENAI_MODEL || '').trim(),
    dryRun: parseBoolean(options.dryRun ?? env.MONEY_AUTOPILOT_DRY_RUN, false),
    publish: {
      githubEnabled: parseBoolean(options.publishEnabled ?? env.MONEY_AUTOPILOT_PUBLISH, false),
      ghToken: String(options.ghToken || env.MONEY_AUTOPILOT_GH_TOKEN || env.GH_PAT || '').trim(),
      ghRepo: String(options.ghRepo || env.MONEY_AUTOPILOT_GH_REPO || env.GITHUB_REPOSITORY || '').trim(),
      ghBranch: String(options.ghBranch || env.MONEY_AUTOPILOT_GH_BRANCH || 'main').trim(),
      publishPathPrefix: String(
        options.publishPathPrefix
        || env.MONEY_AUTOPILOT_PUBLISH_PATH_PREFIX
        || DEFAULT_AUTOPILOT_PROFILE.publishPathPrefix
      ).trim(),
      publishCommitMessagePrefix: String(
        options.publishCommitMessagePrefix
        || env.MONEY_AUTOPILOT_COMMIT_PREFIX
        || 'Autopilot: publish offer'
      ).trim(),
      vercelEnabled: parseBoolean(options.vercelDeploy ?? env.MONEY_AUTOPILOT_VERCEL_DEPLOY, false),
      vercelToken: String(options.vercelToken || env.MONEY_AUTOPILOT_VERCEL_TOKEN || env.VERCEL_TOKEN || '').trim(),
      vercelProjectName: String(
        options.vercelProjectName
        || env.MONEY_AUTOPILOT_VERCEL_PROJECT_NAME
        || env.VERCEL_PROJECT_NAME
        || ''
      ).trim(),
      vercelTarget: String(options.vercelTarget || env.MONEY_AUTOPILOT_VERCEL_TARGET || 'production').trim()
    },
    promotion: {
      enabled: parseBoolean(options.promotionEnabled ?? env.MONEY_AUTOPILOT_PROMOTION, false),
      webhookUrl: String(options.promoWebhookUrl || env.MONEY_AUTOPILOT_PROMO_WEBHOOK_URL || '').trim(),
      defaultDestinationUrl: String(
        options.defaultDestinationUrl
        || env.MONEY_AUTOPILOT_DEFAULT_DESTINATION_URL
        || ''
      ).trim()
    },
    analytics: {
      gaPropertyId: String(options.gaPropertyId || env.MONEY_AUTOPILOT_GA_PROPERTY_ID || '').trim(),
      gaAccessToken: String(options.gaAccessToken || env.MONEY_AUTOPILOT_GA_ACCESS_TOKEN || '').trim()
    }
  };
}

function contentToBase64(content) {
  return Buffer.from(content, 'utf8').toString('base64');
}

async function fetchExistingFileSha({ token, repo, path, branch, fetchImpl }) {
  const url = `https://api.github.com/repos/${repo}/contents/${encodeURIComponent(path)}?ref=${branch}`;
  const response = await fetchImpl(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json'
    }
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GitHub lookup error ${response.status}: ${errorText.slice(0, 220)}`);
  }

  const payload = await response.json();
  return payload?.sha || null;
}

export async function publishOfferToGitHub(options = {}) {
  const {
    token,
    repo,
    path,
    branch = 'main',
    content,
    message,
    fetchImpl = globalThis.fetch
  } = options;

  if (!token || !repo || !path || !content) {
    throw new Error('token, repo, path, and content are required for GitHub publish.');
  }

  const sha = await fetchExistingFileSha({ token, repo, path, branch, fetchImpl });
  const url = `https://api.github.com/repos/${repo}/contents/${encodeURIComponent(path)}`;

  const body = {
    message: message || 'Autopilot publish',
    branch,
    content: contentToBase64(content)
  };

  if (sha) {
    body.sha = sha;
  }

  const response = await fetchImpl(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GitHub publish error ${response.status}: ${errorText.slice(0, 220)}`);
  }

  const payload = await response.json();
  return {
    path: payload?.content?.path || path,
    branch,
    htmlUrl: payload?.content?.html_url || '',
    commitSha: payload?.commit?.sha || ''
  };
}

export async function deployOfferToVercel(options = {}) {
  const {
    token,
    projectName,
    html,
    target = 'production',
    fetchImpl = globalThis.fetch
  } = options;

  if (!token || !projectName || !html) {
    throw new Error('token, projectName, and html are required for Vercel deployment.');
  }

  const payload = {
    name: sanitizeProjectName(projectName),
    files: [
      { file: 'index.html', data: html },
      {
        file: 'README.md',
        data: '# Published by Money Autopilot\n\nGenerated by 3dvr money automation.\n'
      }
    ],
    projectSettings: {
      framework: null
    },
    target
  };

  const response = await fetchImpl('https://api.vercel.com/v13/deployments', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Vercel deploy error ${response.status}: ${errorText.slice(0, 220)}`);
  }

  const data = await response.json();
  return {
    id: data.id || '',
    url: data.url ? `https://${data.url}` : '',
    inspectUrl: data.inspectUrl || ''
  };
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildOfferHtml({ report, opportunity, market }) {
  const top = opportunity || report?.topOpportunity || {};
  const title = top.title || 'Automated Offer';
  const problem = top.problem || 'Teams need faster execution with fewer manual steps.';
  const solution = top.solution || 'Automate repetitive work and keep output quality consistent.';
  const price = top.suggestedPrice || '$29/mo';
  const checklist = Array.isArray(report?.executionChecklist)
    ? report.executionChecklist.slice(0, 5)
    : [];
  const generatedAt = report?.generatedAt || new Date().toISOString();

  const checklistItems = checklist
    .map(item => `      <li>${escapeHtml(item)}</li>`)
    .join('\n');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    body {
      margin: 0;
      font-family: "Segoe UI", Arial, sans-serif;
      background: #f7f5ef;
      color: #1f2d3d;
      line-height: 1.6;
    }
    main {
      max-width: 860px;
      margin: 0 auto;
      padding: 24px 16px 48px;
    }
    .card {
      background: #ffffff;
      border: 1px solid #d7d0bf;
      border-radius: 16px;
      padding: 20px;
      margin-top: 16px;
    }
    .eyebrow {
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-size: 12px;
      color: #56697c;
      margin: 0;
    }
    h1 {
      margin: 8px 0 0;
      font-size: clamp(28px, 5vw, 44px);
      line-height: 1.1;
    }
    h2 {
      margin: 0 0 6px;
      font-size: 18px;
    }
    .price {
      color: #0f766e;
      font-weight: 700;
      margin: 8px 0 0;
      font-size: 20px;
    }
    ul {
      margin: 0;
      padding-left: 20px;
    }
    .cta {
      display: inline-block;
      margin-top: 14px;
      background: #0f766e;
      color: #fff;
      text-decoration: none;
      border-radius: 999px;
      padding: 10px 16px;
      font-weight: 600;
    }
    footer {
      margin-top: 18px;
      font-size: 12px;
      color: #6a7d8f;
    }
  </style>
</head>
<body>
  <main>
    <p class="eyebrow">Autopilot offer draft</p>
    <h1>${escapeHtml(title)}</h1>

    <section class="card">
      <h2>Market</h2>
      <p>${escapeHtml(market || report?.input?.market || 'selected market')}</p>
      <h2>Problem</h2>
      <p>${escapeHtml(problem)}</p>
      <h2>Solution</h2>
      <p>${escapeHtml(solution)}</p>
      <p class="price">Starting at ${escapeHtml(price)}</p>
      <a class="cta" href="/free-trial.html">Start Free Trial</a>
    </section>

    <section class="card">
      <h2>Launch checklist</h2>
      <ul>
${checklistItems || '      <li>Validate demand with 3 user interviews this week.</li>'}
      </ul>
    </section>

    <footer>Generated at ${escapeHtml(generatedAt)} by Money Autopilot.</footer>
  </main>
</body>
</html>
`;
}

function buildPublishPath(config, report) {
  const safePrefix = String(config.publish.publishPathPrefix || DEFAULT_AUTOPILOT_PROFILE.publishPathPrefix)
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
  return `${safePrefix}/${report.runId}.html`;
}

function buildPromotionTasks(adDrafts = [], destinationUrl = '', budget = 0) {
  const drafts = Array.isArray(adDrafts) ? adDrafts.slice(0, 8) : [];
  if (!drafts.length) {
    return [];
  }

  const dailyBudget = Math.max(1, Math.round((budget / 7) * 100) / 100);
  const perTaskBudget = Math.max(1, Math.round((dailyBudget / drafts.length) * 100) / 100);

  return drafts.map(draft => ({
    channel: draft.channel,
    headline: draft.headline,
    body: draft.body,
    cta: draft.cta,
    destinationUrl,
    estimatedDailyBudget: perTaskBudget
  }));
}

async function dispatchPromotionWebhook({ webhookUrl, payload, fetchImpl }) {
  const response = await fetchImpl(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Promotion webhook error ${response.status}: ${errorText.slice(0, 220)}`);
  }

  return {
    status: response.status
  };
}

export async function runAutopilotCycle(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const now = typeof options.now === 'function' ? options.now : () => new Date();
  const runLoopImpl = options.runLoopImpl || runMoneyLoop;
  const collectSignalsImpl = options.collectSignalsImpl || collectDemandSignals;

  const config = resolveAutopilotConfig(options);
  const warnings = [];

  const analytics = await fetchGoogleAnalyticsHints(config.analytics, fetchImpl);
  warnings.push(...analytics.warnings);

  let market = config.market;
  let keywords = config.keywords.slice();

  const marketSelection = {
    mode: config.autoDiscover ? 'discovered' : 'configured',
    sourceSignals: 0,
    candidates: [],
    selected: null
  };

  if (config.autoDiscover) {
    const discovery = await collectSignalsImpl({
      market: config.market,
      keywords: config.discoverySeeds,
      limit: Math.max(config.limit, 30),
      fetchImpl
    });

    marketSelection.sourceSignals = discovery.signals.length;
    warnings.push(...discovery.warnings);

    const candidates = deriveMarketCandidates(
      discovery.signals,
      config.discoverySeeds,
      analytics.keywords
    );

    marketSelection.candidates = candidates;

    if (candidates.length) {
      marketSelection.selected = candidates[0];
      market = candidates[0].market;
      keywords = uniqueStrings([
        ...candidates[0].keywords,
        ...analytics.keywords,
        ...config.keywords
      ]).slice(0, 8);
    } else if (analytics.keywords.length) {
      keywords = uniqueStrings([...analytics.keywords, ...config.keywords]).slice(0, 8);
    }
  }

  const report = await runLoopImpl({
    market,
    keywords,
    channels: config.channels,
    budget: config.budget,
    limit: config.limit,
    openAiApiKey: config.openAiApiKey,
    openAiModel: config.openAiModel
  }, {
    fetchImpl,
    now,
    openAiApiKey: config.openAiApiKey,
    openAiModel: config.openAiModel
  });

  const offerHtml = buildOfferHtml({ report, opportunity: report.topOpportunity, market });

  const publish = {
    destinationUrl: '',
    github: {
      attempted: false,
      published: false,
      dryRun: config.dryRun,
      reason: '',
      path: '',
      branch: config.publish.ghBranch,
      repo: config.publish.ghRepo,
      htmlUrl: '',
      commitSha: ''
    },
    vercel: {
      attempted: false,
      deployed: false,
      dryRun: config.dryRun,
      reason: '',
      projectName: config.publish.vercelProjectName,
      url: '',
      inspectUrl: '',
      deploymentId: ''
    }
  };

  if (!config.publish.githubEnabled) {
    publish.github.reason = 'github publish disabled';
  } else if (!config.publish.ghRepo || !config.publish.ghToken) {
    publish.github.reason = 'missing GitHub publish credentials';
  } else {
    publish.github.attempted = true;
    publish.github.path = buildPublishPath(config, report);

    if (config.dryRun) {
      publish.github.reason = 'dry run enabled';
    } else {
      const result = await publishOfferToGitHub({
        token: config.publish.ghToken,
        repo: config.publish.ghRepo,
        path: publish.github.path,
        branch: config.publish.ghBranch,
        content: offerHtml,
        message: `${config.publish.publishCommitMessagePrefix}: ${report.runId}`,
        fetchImpl
      });

      publish.github.published = true;
      publish.github.htmlUrl = result.htmlUrl;
      publish.github.commitSha = result.commitSha;
    }
  }

  if (!config.publish.vercelEnabled) {
    publish.vercel.reason = 'vercel deploy disabled';
  } else if (!config.publish.vercelToken || !config.publish.vercelProjectName) {
    publish.vercel.reason = 'missing Vercel deploy credentials';
  } else {
    publish.vercel.attempted = true;

    if (config.dryRun) {
      publish.vercel.reason = 'dry run enabled';
    } else {
      const result = await deployOfferToVercel({
        token: config.publish.vercelToken,
        projectName: config.publish.vercelProjectName,
        html: offerHtml,
        target: config.publish.vercelTarget,
        fetchImpl
      });

      publish.vercel.deployed = true;
      publish.vercel.url = result.url;
      publish.vercel.inspectUrl = result.inspectUrl;
      publish.vercel.deploymentId = result.id;
    }
  }

  publish.destinationUrl = publish.vercel.url
    || publish.github.htmlUrl
    || config.promotion.defaultDestinationUrl
    || '';

  const promotionTasks = buildPromotionTasks(report.adDrafts, publish.destinationUrl, report.input?.budget || config.budget);
  const promotion = {
    enabled: config.promotion.enabled,
    attempted: false,
    dispatched: false,
    dryRun: config.dryRun,
    reason: '',
    webhookStatus: null,
    destinationUrl: publish.destinationUrl,
    tasks: promotionTasks
  };

  if (!config.promotion.enabled) {
    promotion.reason = 'promotion dispatch disabled';
  } else if (!publish.destinationUrl) {
    promotion.reason = 'missing destination URL for campaign traffic';
  } else if (!config.promotion.webhookUrl) {
    promotion.reason = 'missing promotion webhook URL';
  } else {
    promotion.attempted = true;

    if (config.dryRun) {
      promotion.reason = 'dry run enabled';
    } else {
      const webhookResult = await dispatchPromotionWebhook({
        webhookUrl: config.promotion.webhookUrl,
        payload: {
          runId: report.runId,
          generatedAt: report.generatedAt,
          market,
          keywords,
          budget: report.input?.budget || config.budget,
          destinationUrl: publish.destinationUrl,
          topOpportunity: report.topOpportunity,
          tasks: promotionTasks
        },
        fetchImpl
      });

      promotion.dispatched = true;
      promotion.webhookStatus = webhookResult.status;
    }
  }

  return {
    runId: report.runId,
    generatedAt: report.generatedAt,
    market,
    keywords,
    budget: report.input?.budget || config.budget,
    marketSelection,
    analytics,
    signalsAnalyzed: report.signals.length,
    warnings: uniqueStrings([...warnings, ...(report.warnings || [])]),
    topOpportunity: report.topOpportunity,
    opportunities: report.opportunities,
    adDrafts: report.adDrafts,
    executionChecklist: report.executionChecklist,
    publish,
    promotion,
    artifacts: {
      offerHtml
    }
  };
}

import { runMoneyLoop } from './engine.js';

const DEFAULT_AUTOPILOT_PROFILE = {
  market: 'freelancers managing outreach and follow-up',
  keywords: ['lead follow-up', 'proposal workflow', 'client onboarding'],
  channels: ['reddit', 'x', 'linkedin', 'email'],
  budget: 150,
  limit: 24,
  maxBudget: 300,
  publishPathPrefix: 'money-ai/offers'
};

function parseCsvList(value) {
  if (!value || typeof value !== 'string') {
    return [];
  }

  return value
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function parseBudget(value, fallback) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return fallback;
  }

  const cleaned = String(value).replace(/[^\d.]/g, '');
  if (!cleaned) {
    return fallback;
  }

  const numeric = typeof value === 'number'
    ? value
    : Number(cleaned);

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

export function resolveAutopilotConfig(options = {}) {
  const env = options.env || process.env;

  const market = (options.market || env.MONEY_AUTOPILOT_MARKET || DEFAULT_AUTOPILOT_PROFILE.market).trim();
  const keywords = options.keywords
    || parseCsvList(env.MONEY_AUTOPILOT_KEYWORDS)
    || DEFAULT_AUTOPILOT_PROFILE.keywords;
  const channels = options.channels
    || parseCsvList(env.MONEY_AUTOPILOT_CHANNELS)
    || DEFAULT_AUTOPILOT_PROFILE.channels;

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
    market,
    keywords: (Array.isArray(keywords) && keywords.length ? keywords : DEFAULT_AUTOPILOT_PROFILE.keywords)
      .slice(0, 8),
    channels: (Array.isArray(channels) && channels.length ? channels : DEFAULT_AUTOPILOT_PROFILE.channels)
      .slice(0, 5),
    budget,
    limit: Number.isFinite(options.limit)
      ? options.limit
      : Number.isFinite(Number(env.MONEY_AUTOPILOT_SIGNAL_LIMIT))
        ? Number(env.MONEY_AUTOPILOT_SIGNAL_LIMIT)
        : DEFAULT_AUTOPILOT_PROFILE.limit,
    openAiApiKey: options.openAiApiKey || env.OPENAI_API_KEY || '',
    openAiModel: options.openAiModel || env.OPENAI_MODEL || '',
    publishEnabled: parseBoolean(options.publishEnabled ?? env.MONEY_AUTOPILOT_PUBLISH, false),
    dryRun: parseBoolean(options.dryRun ?? env.MONEY_AUTOPILOT_DRY_RUN, false),
    ghToken: options.ghToken || env.MONEY_AUTOPILOT_GH_TOKEN || env.GH_PAT || '',
    ghRepo: options.ghRepo || env.MONEY_AUTOPILOT_GH_REPO || env.GITHUB_REPOSITORY || '',
    ghBranch: options.ghBranch || env.MONEY_AUTOPILOT_GH_BRANCH || 'main',
    publishPathPrefix: options.publishPathPrefix
      || env.MONEY_AUTOPILOT_PUBLISH_PATH_PREFIX
      || DEFAULT_AUTOPILOT_PROFILE.publishPathPrefix,
    publishCommitMessagePrefix: options.publishCommitMessagePrefix
      || env.MONEY_AUTOPILOT_COMMIT_PREFIX
      || 'Autopilot: publish offer'
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

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildOfferHtml({ report, opportunity }) {
  const top = opportunity || report?.topOpportunity || {};
  const title = top.title || 'Automated Offer';
  const problem = top.problem || 'Teams need faster execution with fewer manual steps.';
  const solution = top.solution || 'Automate repetitive work and keep output quality consistent.';
  const price = top.suggestedPrice || '$29/mo';
  const checklist = Array.isArray(report?.executionChecklist) ? report.executionChecklist.slice(0, 5) : [];
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
  const safePrefix = String(config.publishPathPrefix || DEFAULT_AUTOPILOT_PROFILE.publishPathPrefix)
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
  return `${safePrefix}/${report.runId}.html`;
}

export async function runAutopilotCycle(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const now = typeof options.now === 'function' ? options.now : () => new Date();
  const runLoopImpl = options.runLoopImpl || runMoneyLoop;

  const config = resolveAutopilotConfig(options);

  const report = await runLoopImpl({
    market: config.market,
    keywords: config.keywords,
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

  const offerHtml = buildOfferHtml({ report, opportunity: report.topOpportunity });

  const publish = {
    attempted: false,
    published: false,
    dryRun: config.dryRun,
    reason: '',
    path: '',
    branch: config.ghBranch,
    repo: config.ghRepo,
    htmlUrl: '',
    commitSha: ''
  };

  if (!config.publishEnabled) {
    publish.reason = 'publish disabled';
  } else if (!config.ghRepo || !config.ghToken) {
    publish.reason = 'missing GitHub publish credentials';
  } else {
    publish.attempted = true;
    const path = buildPublishPath(config, report);
    publish.path = path;

    if (config.dryRun) {
      publish.reason = 'dry run enabled';
    } else {
      const result = await publishOfferToGitHub({
        token: config.ghToken,
        repo: config.ghRepo,
        path,
        branch: config.ghBranch,
        content: offerHtml,
        message: `${config.publishCommitMessagePrefix}: ${report.runId}`,
        fetchImpl
      });

      publish.published = true;
      publish.htmlUrl = result.htmlUrl;
      publish.commitSha = result.commitSha;
    }
  }

  return {
    runId: report.runId,
    generatedAt: report.generatedAt,
    market: report.input.market,
    budget: report.input.budget,
    topOpportunity: report.topOpportunity,
    warnings: report.warnings,
    signalsAnalyzed: report.signals.length,
    publish,
    artifacts: {
      offerHtml,
      adDrafts: report.adDrafts,
      opportunities: report.opportunities,
      executionChecklist: report.executionChecklist
    }
  };
}

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function resolveGithubConfig(options = {}, env = process.env) {
  const repoFullName = String(options.repo || env.GITHUB_REPOSITORY || '').trim();
  const [repoOwner, repoName] = repoFullName.includes('/') ? repoFullName.split('/') : [];
  return {
    token: String(options.token || env.GITHUB_TOKEN || '').trim(),
    owner: String(options.owner || env.GITHUB_OWNER || repoOwner || '').trim(),
    repo: String(options.repoName || env.GITHUB_REPO || repoName || '').trim(),
    allowWrite: parseBoolean(options.allowWrite ?? env.MONEY_PRINTER_ALLOW_GITHUB_WRITE, false)
  };
}

function repoSlug(config) {
  return config.owner && config.repo ? `${config.owner}/${config.repo}` : '';
}

function missingConfig(config, includeWrite = false) {
  const missing = [];
  if (!config.token) missing.push('GITHUB_TOKEN');
  if (!config.owner) missing.push('GITHUB_OWNER');
  if (!config.repo) missing.push('GITHUB_REPO');
  if (includeWrite && !config.allowWrite) missing.push('MONEY_PRINTER_ALLOW_GITHUB_WRITE=true');
  return missing;
}

async function readError(response) {
  const text = await response.text();
  return text.slice(0, 320);
}

export async function readGithubStatus(options = {}) {
  const config = resolveGithubConfig(options, options.env || process.env);
  const missing = missingConfig(config);
  return {
    id: 'github',
    provider: 'github',
    configured: missing.length === 0,
    tokenPresent: Boolean(config.token),
    repo: repoSlug(config),
    allowWrite: config.allowWrite,
    missing,
    message: missing.length
      ? `GitHub connector missing: ${missing.join(', ')}.`
      : `GitHub connector configured for ${repoSlug(config)}.`
  };
}

export async function inspectGithubRepo(options = {}) {
  const config = resolveGithubConfig(options, options.env || process.env);
  const missing = missingConfig(config);
  if (missing.length) {
    return {
      ok: false,
      provider: 'github',
      skipped: true,
      missing,
      message: `Cannot inspect GitHub repo until ${missing.join(', ')} is configured.`
    };
  }

  const response = await (options.fetchImpl || globalThis.fetch)(
    `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}`,
    {
      headers: {
        Authorization: `Bearer ${config.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      }
    }
  );

  if (!response.ok) {
    return {
      ok: false,
      provider: 'github',
      status: response.status,
      message: `GitHub repo inspect failed: ${await readError(response)}`
    };
  }

  const payload = await response.json();
  return {
    ok: true,
    provider: 'github',
    repo: payload.full_name || repoSlug(config),
    defaultBranch: payload.default_branch || '',
    private: Boolean(payload.private),
    htmlUrl: payload.html_url || ''
  };
}

export async function createGithubIssue(options = {}) {
  const config = resolveGithubConfig(options, options.env || process.env);
  const execute = options.execute === true;
  const missing = missingConfig(config, true);
  const title = String(options.title || options.payload?.title || '').trim();
  const body = String(options.body || options.payload?.body || '').trim();
  const labels = Array.isArray(options.labels || options.payload?.labels)
    ? (options.labels || options.payload?.labels).map(String).filter(Boolean)
    : ['money-printer'];

  if (!title) {
    return {
      ok: false,
      provider: 'github',
      action: 'createIssue',
      status: 'failed',
      message: 'GitHub issue title is required.'
    };
  }

  if (!execute) {
    return {
      ok: false,
      provider: 'github',
      action: 'createIssue',
      status: 'skipped',
      executeRequired: true,
      message: 'Pass --execute to create the GitHub issue.'
    };
  }

  if (missing.length) {
    return {
      ok: false,
      provider: 'github',
      action: 'createIssue',
      status: 'skipped',
      missing,
      message: `GitHub issue creation blocked until ${missing.join(', ')} is configured.`
    };
  }

  const response = await (options.fetchImpl || globalThis.fetch)(
    `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/issues`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28'
      },
      body: JSON.stringify({
        title,
        body,
        labels
      })
    }
  );

  if (!response.ok) {
    return {
      ok: false,
      provider: 'github',
      action: 'createIssue',
      status: 'failed',
      httpStatus: response.status,
      message: `GitHub issue creation failed: ${await readError(response)}`
    };
  }

  const payload = await response.json();
  return {
    ok: true,
    provider: 'github',
    action: 'createIssue',
    status: 'executed',
    issueNumber: payload.number,
    htmlUrl: payload.html_url,
    title: payload.title
  };
}

export async function createIssueFromOperation(operation = {}, options = {}) {
  return createGithubIssue({
    ...options,
    payload: operation.payload || {},
    title: operation.payload?.title || operation.title,
    body: operation.payload?.body || operation.summary,
    labels: operation.payload?.labels
  });
}

export function createGithubBranchPlan(operation = {}) {
  return {
    ok: true,
    provider: 'github',
    action: 'createBranchPlan',
    status: 'planned',
    title: operation.title || 'Create implementation branch',
    steps: [
      'Create a branch from origin/main.',
      'Apply the approved Money Printer change.',
      'Run focused tests.',
      'Open a pull request with the business reason and verification.'
    ]
  };
}

export function createGithubPullRequestPlan(operation = {}) {
  return {
    ok: true,
    provider: 'github',
    action: 'createPullRequestPlan',
    status: 'planned',
    title: operation.title || 'Open pull request',
    steps: [
      'Push the approved branch.',
      'Open a PR against main.',
      'Include Money Printer report links and test output.',
      'Wait for human review before merge.'
    ]
  };
}

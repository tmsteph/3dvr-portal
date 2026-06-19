function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function resolveVercelConfig(options = {}, env = process.env) {
  return {
    token: String(options.token || env.VERCEL_TOKEN || '').trim(),
    projectId: String(options.projectId || env.VERCEL_PROJECT_ID || env.MONEY_PRINTER_VERCEL_PROJECT_ID || '').trim(),
    teamId: String(options.teamId || env.VERCEL_TEAM_ID || '').trim(),
    allowWrite: parseBoolean(options.allowWrite ?? env.MONEY_PRINTER_ALLOW_VERCEL_WRITE, false)
  };
}

function withTeam(url, teamId) {
  if (!teamId) return url;
  const parsed = new URL(url);
  parsed.searchParams.set('teamId', teamId);
  return parsed.toString();
}

function missingReadConfig(config) {
  const missing = [];
  if (!config.token) missing.push('VERCEL_TOKEN');
  if (!config.projectId) missing.push('VERCEL_PROJECT_ID');
  return missing;
}

async function readError(response) {
  const text = await response.text();
  return text.slice(0, 320);
}

export async function readVercelStatus(options = {}) {
  const config = resolveVercelConfig(options, options.env || process.env);
  const missing = missingReadConfig(config);
  return {
    id: 'vercel',
    provider: 'vercel',
    configured: missing.length === 0,
    tokenPresent: Boolean(config.token),
    projectId: config.projectId,
    teamIdPresent: Boolean(config.teamId),
    allowWrite: config.allowWrite,
    missing,
    message: missing.length
      ? `Vercel connector missing: ${missing.join(', ')}.`
      : `Vercel connector configured for project ${config.projectId}.`
  };
}

export async function inspectVercelProject(options = {}) {
  const config = resolveVercelConfig(options, options.env || process.env);
  const missing = missingReadConfig(config);
  if (missing.length) {
    return {
      ok: false,
      provider: 'vercel',
      skipped: true,
      missing,
      message: `Cannot inspect Vercel project until ${missing.join(', ')} is configured.`
    };
  }

  const url = withTeam(
    `https://api.vercel.com/v9/projects/${encodeURIComponent(config.projectId)}`,
    config.teamId
  );
  const response = await (options.fetchImpl || globalThis.fetch)(url, {
    headers: { Authorization: `Bearer ${config.token}` }
  });

  if (!response.ok) {
    return {
      ok: false,
      provider: 'vercel',
      status: response.status,
      message: `Vercel project inspect failed: ${await readError(response)}`
    };
  }

  const payload = await response.json();
  return {
    ok: true,
    provider: 'vercel',
    projectId: payload.id || config.projectId,
    name: payload.name || '',
    framework: payload.framework || '',
    accountId: payload.accountId || ''
  };
}

export async function listVercelDeployments(options = {}) {
  const config = resolveVercelConfig(options, options.env || process.env);
  const missing = missingReadConfig(config);
  if (missing.length) {
    return {
      ok: false,
      provider: 'vercel',
      skipped: true,
      missing,
      message: `Cannot list Vercel deployments until ${missing.join(', ')} is configured.`
    };
  }

  const base = new URL('https://api.vercel.com/v6/deployments');
  base.searchParams.set('projectId', config.projectId);
  base.searchParams.set('limit', String(options.limit || 5));
  if (config.teamId) base.searchParams.set('teamId', config.teamId);

  const response = await (options.fetchImpl || globalThis.fetch)(base.toString(), {
    headers: { Authorization: `Bearer ${config.token}` }
  });

  if (!response.ok) {
    return {
      ok: false,
      provider: 'vercel',
      status: response.status,
      message: `Vercel deployments list failed: ${await readError(response)}`
    };
  }

  const payload = await response.json();
  return {
    ok: true,
    provider: 'vercel',
    deployments: (payload.deployments || []).map(item => ({
      uid: item.uid || item.id || '',
      name: item.name || '',
      url: item.url ? `https://${item.url}` : '',
      state: item.state || '',
      target: item.target || '',
      createdAt: item.createdAt || item.created || null
    }))
  };
}

export async function inspectVercelDeployment(options = {}) {
  const config = resolveVercelConfig(options, options.env || process.env);
  const deploymentId = String(options.deploymentId || options.payload?.deploymentId || '').trim();
  const missing = missingReadConfig(config);
  if (!deploymentId) missing.push('deploymentId');
  if (missing.length) {
    return {
      ok: false,
      provider: 'vercel',
      skipped: true,
      missing,
      message: `Cannot inspect Vercel deployment until ${missing.join(', ')} is configured.`
    };
  }

  const url = withTeam(`https://api.vercel.com/v13/deployments/${encodeURIComponent(deploymentId)}`, config.teamId);
  const response = await (options.fetchImpl || globalThis.fetch)(url, {
    headers: { Authorization: `Bearer ${config.token}` }
  });

  if (!response.ok) {
    return {
      ok: false,
      provider: 'vercel',
      status: response.status,
      message: `Vercel deployment inspect failed: ${await readError(response)}`
    };
  }

  const payload = await response.json();
  return {
    ok: true,
    provider: 'vercel',
    id: payload.id || deploymentId,
    url: payload.url ? `https://${payload.url}` : '',
    readyState: payload.readyState || payload.state || '',
    target: payload.target || '',
    createdAt: payload.createdAt || null
  };
}

export function createVercelPreviewDeploymentPlan(operation = {}, options = {}) {
  const config = resolveVercelConfig(options, options.env || process.env);
  return {
    ok: true,
    provider: 'vercel',
    action: 'createPreviewDeploymentPlan',
    status: 'planned',
    projectId: config.projectId,
    title: operation.title || 'Create Vercel preview deployment',
    steps: [
      'Use the Vercel CLI or deployments API after a branch exists.',
      'Run focused tests before preview creation.',
      'Create a preview deployment, not production.',
      'Report the preview URL and do not alias or promote without approval.'
    ],
    command: 'vercel deploy'
  };
}

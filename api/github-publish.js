const setCorsHeaders = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
};

const DEFAULT_SITE_LAUNCH_VERCEL_TEAM_ID = 'team_KXuVUd00RMnDsjoqwdREcZ7J';
const DEFAULT_SITE_LAUNCH_VERCEL_DNS_TEAM_ID = 'team_xxJGO7S7h1ZP4BHidYV0CX9Z';
const DEFAULT_VERCEL_READY_TIMEOUT_MS = 30_000;
const DEFAULT_VERCEL_READY_POLL_INTERVAL_MS = 1_000;
const DEFAULT_VERCEL_DNS_VERIFY_RETRY_DELAY_MS = 2_000;
const DEFAULT_VERCEL_DNS_VERIFY_MAX_ATTEMPTS = 5;
const VERCEL_READY_STATE = 'READY';
const VERCEL_FAILED_READY_STATES = new Set(['ERROR', 'CANCELED']);
const VERCEL_DOMAIN_EXISTS_CODES = new Set([
  'domain_already_exists',
  'domain_already_in_project',
  'domain_already_in_use',
  'domain_exists'
]);

function resolveSiteLaunchVercelTeamId(configuredTeamId) {
  return [
    configuredTeamId,
    process.env.SITE_LAUNCH_VERCEL_TEAM_ID,
    DEFAULT_SITE_LAUNCH_VERCEL_TEAM_ID
  ].map(value => String(value || '').trim()).find(Boolean);
}

function isDisabledConfigValue(value) {
  if (value === false) {
    return true;
  }

  return ['0', 'false', 'none', 'off'].includes(String(value || '').trim().toLowerCase());
}

function resolveSiteLaunchVercelDnsTeamId(configuredTeamId) {
  if (isDisabledConfigValue(configuredTeamId) || isDisabledConfigValue(process.env.SITE_LAUNCH_VERCEL_DNS_TEAM_ID)) {
    return '';
  }

  return [
    configuredTeamId,
    process.env.SITE_LAUNCH_VERCEL_DNS_TEAM_ID,
    DEFAULT_SITE_LAUNCH_VERCEL_DNS_TEAM_ID
  ].map(value => String(value || '').trim()).find(Boolean);
}

function delay(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

function parseProvider(req) {
  const fromQuery = String(req?.query?.provider || '').trim().toLowerCase();
  if (fromQuery) {
    return fromQuery;
  }
  const fromBody = String(req?.body?.provider || '').trim().toLowerCase();
  if (fromBody) {
    return fromBody;
  }
  return 'github';
}

function parseVercelErrorPayload(errorText) {
  if (!errorText) {
    return { code: '', details: null };
  }

  try {
    const parsed = JSON.parse(errorText);
    return {
      code: parsed?.error?.code || parsed?.code || '',
      details: parsed?.error || parsed
    };
  } catch (parseError) {
    return { code: '', details: null };
  }
}

function createVercelApiError(label, response, errorText) {
  const { code, details } = parseVercelErrorPayload(errorText);
  const error = new Error(`${label} ${response.status}: ${errorText || 'Unknown error'}`);
  error.status = response.status;
  error.code = code;
  error.details = details;
  return error;
}

function extractVercelVerificationFromMessage(message) {
  const text = String(message || '');
  const match = text.match(/Domain\s+([^\s]+)\s+is\s+missing\s+required\s+([A-Z]+)\s+Record\s+"([^"]+)"/i);
  if (!match) {
    return undefined;
  }

  return [{
    type: match[2].toUpperCase(),
    domain: match[1],
    value: match[3]
  }];
}

function resolveGithubRepo(body = {}) {
  const explicit = String(body.repo || '').trim();
  if (explicit && explicit.includes('/')) {
    return explicit;
  }

  const owner = String(body.owner || '').trim();
  if (owner && explicit) {
    return `${owner}/${explicit}`;
  }

  return explicit;
}

function validateGithubRequest(body) {
  const { token, content } = body || {};
  const repo = resolveGithubRepo(body);

  if (!token || typeof token !== 'string') {
    return 'A GitHub personal access token is required.';
  }

  if (!repo || typeof repo !== 'string' || !repo.includes('/')) {
    return 'Provide the repo as "owner/name".';
  }

  if (!content || typeof content !== 'string') {
    return 'Content is required to create or update the file.';
  }

  if (content.trim().length < 20 || !content.toLowerCase().includes('<html')) {
    return 'Provide full HTML content before committing to GitHub.';
  }

  return null;
}

const RESERVED_SUBDOMAINS = new Set([
  'admin',
  'api',
  'app',
  'apps',
  'billing',
  'cdn',
  'dashboard',
  'deploy',
  'email',
  'help',
  'launch',
  'mail',
  'portal',
  'staging',
  'static',
  'support',
  'vercel',
  'www'
]);

function sanitizeProjectName(value, fallback = 'site-launch') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

  return normalized || fallback;
}

export function sanitizeLaunchSubdomain(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 48);

  if (!normalized || normalized.length < 3) {
    return '';
  }

  if (RESERVED_SUBDOMAINS.has(normalized)) {
    return '';
  }

  return normalized;
}

export function sanitizeCustomDomain(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/^\.+|\.+$/g, '');

  if (!normalized || normalized.length > 253 || !normalized.includes('.')) {
    return '';
  }

  if (normalized.includes('..') || normalized.includes('*')) {
    return '';
  }

  const labels = normalized.split('.');
  if (labels.some(label => (
    !label
    || label.length > 63
    || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)
  ))) {
    return '';
  }

  return normalized;
}

export function resolveLaunchDomain(body = {}, options = {}) {
  const baseDomain = String(options.baseDomain || process.env.SITE_LAUNCH_BASE_DOMAIN || '3dvr.tech')
    .trim()
    .toLowerCase()
    .replace(/^\.+|\.+$/g, '');

  const customDomain = sanitizeCustomDomain(body.customDomain || body.domain);
  if (customDomain) {
    return {
      subdomain: customDomain.split('.')[0],
      domain: customDomain,
      baseDomain: customDomain.split('.').slice(-2).join('.'),
      customDomain: true
    };
  }

  const requestedSubdomain = body.subdomain || body.siteSlug || body.slug || body.alias;
  const subdomain = sanitizeLaunchSubdomain(requestedSubdomain);

  if (!subdomain || !baseDomain) {
    return null;
  }

  return {
    subdomain,
    domain: `${subdomain}.${baseDomain}`,
    baseDomain
  };
}

function validateVercelRequest(body, options = {}) {
  const { token, html } = body || {};
  const effectiveToken = token || options.defaultToken;
  const projectName = options.projectName || body?.projectName;

  if (!effectiveToken || typeof effectiveToken !== 'string') {
    return 'A Vercel token is required. Configure VERCEL_TOKEN or provide a token.';
  }

  if (!projectName || typeof projectName !== 'string') {
    return 'A project name is required.';
  }

  if (!html || typeof html !== 'string') {
    return 'HTML content is required for deployment.';
  }

  const trimmed = html.trim();
  if (!trimmed || trimmed.length < 20 || !trimmed.toLowerCase().includes('<html')) {
    return 'Provide complete HTML content before deploying to Vercel.';
  }

  return null;
}

function resolveSiteLaunchVercelProjectName(bodyProjectName, launchDomain, configuredProjectName) {
  if (!launchDomain?.domain) {
    return bodyProjectName;
  }

  return [
    configuredProjectName,
    process.env.SITE_LAUNCH_VERCEL_PROJECT_NAME,
    bodyProjectName
  ].map(value => String(value || '').trim()).find(Boolean);
}

async function fetchExistingFile({ token, repo, path, branch, fetchImpl }) {
  const url = `https://api.github.com/repos/${repo}/contents/${encodeURIComponent(path)}?ref=${branch}`;
  const response = await fetchImpl(url, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GitHub lookup error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  return data?.sha || null;
}

async function commitToGithub({ token, repo, path, branch, content, message, fetchImpl = globalThis.fetch }) {
  const sha = await fetchExistingFile({ token, repo, path, branch, fetchImpl });
  const url = `https://api.github.com/repos/${repo}/contents/${encodeURIComponent(path)}`;
  const body = {
    message: message || 'Publish from 3dvr OpenAI workbench',
    content: Buffer.from(content).toString('base64'),
    branch,
  };

  if (sha) {
    body.sha = sha;
  }

  const response = await fetchImpl(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GitHub commit error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  return {
    path: data.content?.path || path,
    branch,
    htmlUrl: data.content?.html_url,
    commitSha: data.commit?.sha,
  };
}

async function assignVercelAlias({ token, deploymentId, domain, teamId, fetchImpl = globalThis.fetch }) {
  if (!domain) {
    return null;
  }

  const query = teamId ? `?teamId=${encodeURIComponent(teamId)}` : '';
  const response = await fetchImpl(`https://api.vercel.com/v2/deployments/${deploymentId}/aliases${query}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ alias: domain })
  });

  if (!response.ok) {
    const errorText = await response.text();
    const error = createVercelApiError('Vercel alias error', response, errorText);
    if (response.status === 409 && String(error.code || '').trim() === 'not_modified') {
      const alias = error?.details?.alias || domain;
      return {
        alias,
        aliasUrl: `https://${alias}`,
        aliasAssigned: true,
        aliasAlreadyAssigned: true,
        aliasStatus: response.status
      };
    }
    throw error;
  }

  const data = await response.json();
  return {
    alias: data.alias || domain,
    aliasUrl: `https://${data.alias || domain}`,
    aliasAssigned: true
  };
}

function isVercelDomainExistsError(error) {
  const code = String(error?.code || '').trim();
  const message = String(error?.message || '').toLowerCase();
  return VERCEL_DOMAIN_EXISTS_CODES.has(code)
    || (message.includes('domain') && (
      message.includes('already exists')
      || message.includes('already added')
      || message.includes('already in use')
    ));
}

async function addVercelProjectDomain({
  token,
  projectName,
  domain,
  teamId,
  fetchImpl = globalThis.fetch
}) {
  if (!domain || !projectName) {
    return null;
  }

  const url = withVercelTeamScope(
    `https://api.vercel.com/v10/projects/${encodeURIComponent(projectName)}/domains`,
    teamId
  );
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ name: domain })
  });

  if (!response.ok) {
    const errorText = await response.text();
    const error = createVercelApiError('Vercel project domain error', response, errorText);
    if (isVercelDomainExistsError(error)) {
      const existingDomain = error?.details?.domain || {};
      return {
        projectDomain: existingDomain.name || domain,
        projectDomainAdded: false,
        projectDomainReady: existingDomain.verified !== false,
        projectDomainStatus: existingDomain.verified === false ? 'pending' : 'exists',
        projectDomainVerified: existingDomain.verified,
        projectDomainVerification: existingDomain.verification
      };
    }
    throw error;
  }

  const data = await response.json();
  return {
    projectDomain: data.name || domain,
    projectDomainAdded: true,
    projectDomainStatus: data.verified === false ? 'pending' : 'added',
    projectDomainReady: data.verified !== false,
    projectDomainVerified: data.verified,
    projectDomainVerification: data.verification
  };
}

async function verifyVercelProjectDomain({
  token,
  projectName,
  domain,
  teamId,
  fetchImpl = globalThis.fetch
}) {
  const url = withVercelTeamScope(
    `https://api.vercel.com/v9/projects/${encodeURIComponent(projectName)}/domains/${encodeURIComponent(domain)}/verify`,
    teamId
  );
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw createVercelApiError('Vercel project domain verify error', response, errorText);
  }

  const data = await response.json();
  return {
    projectDomain: data.name || domain,
    projectDomainReady: data.verified !== false,
    projectDomainVerified: data.verified,
    projectDomainVerification: data.verification,
    projectDomainStatus: data.verified === false ? 'pending' : 'verified'
  };
}

function normalizeVercelVerificationRecords(records) {
  return (Array.isArray(records) ? records : [records])
    .map(record => ({
      type: String(record?.type || '').trim().toUpperCase(),
      domain: String(record?.domain || '').trim().toLowerCase().replace(/^\.+|\.+$/g, ''),
      value: String(record?.value || '').trim()
    }))
    .filter(record => record.type === 'TXT' && record.domain && record.value);
}

function resolveDnsRecordName(recordDomain, baseDomain) {
  const normalizedDomain = String(recordDomain || '').trim().toLowerCase().replace(/^\.+|\.+$/g, '');
  const normalizedBase = String(baseDomain || '').trim().toLowerCase().replace(/^\.+|\.+$/g, '');

  if (!normalizedDomain || !normalizedBase) {
    return null;
  }

  if (normalizedDomain === normalizedBase) {
    return '';
  }

  const suffix = `.${normalizedBase}`;
  if (!normalizedDomain.endsWith(suffix)) {
    return null;
  }

  return normalizedDomain.slice(0, -suffix.length);
}

async function addVercelDnsVerificationRecord({
  token,
  baseDomain,
  record,
  dnsTeamId,
  fetchImpl = globalThis.fetch
}) {
  const name = resolveDnsRecordName(record.domain, baseDomain);
  if (name === null || !dnsTeamId) {
    return null;
  }

  const url = withVercelTeamScope(
    `https://api.vercel.com/v3/domains/${encodeURIComponent(baseDomain)}/records`,
    dnsTeamId
  );
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name,
      type: record.type,
      value: record.value
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    const error = createVercelApiError('Vercel DNS record error', response, errorText);
    if (response.status === 409 || String(error.code || '').toLowerCase().includes('conflict')) {
      return {
        domain: record.domain,
        name,
        type: record.type,
        value: record.value,
        added: false,
        status: 'exists'
      };
    }
    throw error;
  }

  const data = await response.json();
  return {
    domain: record.domain,
    name,
    type: record.type,
    value: record.value,
    id: data.id,
    added: true,
    status: 'added'
  };
}

async function addVercelDnsVerificationRecords({
  token,
  baseDomain,
  verification,
  dnsTeamId,
  fetchImpl = globalThis.fetch
}) {
  const records = normalizeVercelVerificationRecords(verification);
  if (!dnsTeamId || !records.length) {
    return null;
  }

  const results = [];
  for (const record of records) {
    const result = await addVercelDnsVerificationRecord({
      token,
      baseDomain,
      record,
      dnsTeamId,
      fetchImpl
    });
    if (result) {
      results.push(result);
    }
  }

  if (!results.length) {
    return null;
  }

  return {
    projectDomainDnsRecordAdded: results.some(result => result.added),
    projectDomainDnsRecordStatus: results.every(result => result.status === 'exists') ? 'exists' : 'added',
    projectDomainDnsRecords: results
  };
}

async function verifyVercelProjectDomainWithDnsRetry({
  token,
  projectName,
  domain,
  baseDomain,
  teamId,
  dnsTeamId,
  projectDomainResult,
  fetchImpl = globalThis.fetch,
  sleepImpl = delay,
  retryDelayMs = DEFAULT_VERCEL_DNS_VERIFY_RETRY_DELAY_MS,
  retryAttempts = DEFAULT_VERCEL_DNS_VERIFY_MAX_ATTEMPTS
}) {
  try {
    return await verifyVercelProjectDomain({
      token,
      projectName,
      domain,
      teamId,
      fetchImpl
    });
  } catch (error) {
    const verification = error?.details?.verification
      || extractVercelVerificationFromMessage(error?.details?.message || error?.message)
      || projectDomainResult?.projectDomainVerification;

    let dnsResult = null;
    try {
      dnsResult = await addVercelDnsVerificationRecords({
        token,
        baseDomain,
        verification,
        dnsTeamId,
        fetchImpl
      });
    } catch (dnsError) {
      dnsError.details = {
        ...(dnsError.details || {}),
        verification: normalizeVercelVerificationRecords(verification)
      };
      throw dnsError;
    }

    if (!dnsResult) {
      throw error;
    }

    const maxAttempts = Math.max(1, Number(retryAttempts) || DEFAULT_VERCEL_DNS_VERIFY_MAX_ATTEMPTS);
    let retryError = null;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      if (retryDelayMs > 0) {
        await sleepImpl(retryDelayMs);
      }

      try {
        const verifiedDomainResult = await verifyVercelProjectDomain({
          token,
          projectName,
          domain,
          teamId,
          fetchImpl
        });

        return {
          ...verifiedDomainResult,
          ...dnsResult
        };
      } catch (nextError) {
        retryError = nextError;
      }
    }

    retryError.dnsVerificationResult = dnsResult;
    retryError.details = {
      ...(retryError.details || {}),
      verification: normalizeVercelVerificationRecords(verification)
    };
    throw retryError;
  }
}

function toVercelAliasFallback({ error, domain }) {
  const code = String(error?.code || '').trim();
  const message = error?.message || 'Vercel alias assignment failed.';
  return {
    alias: domain,
    aliasUrl: null,
    aliasAssigned: false,
    aliasError: message,
    aliasErrorCode: code || undefined,
    aliasStatus: error?.status,
    aliasDetails: error?.details || undefined,
    domainSetupUrl: code === 'domain_not_found' ? 'https://vercel.com/dashboard/domains' : undefined
  };
}

function toVercelUnverifiedDomainFallback({ domain, projectDomainResult, error }) {
  const code = String(error?.code || '').trim() || 'domain_not_verified';
  const message = error?.message || `Vercel project domain ${domain} is not verified yet.`;
  const verification = error?.details?.verification
    || extractVercelVerificationFromMessage(error?.details?.message || error?.message)
    || projectDomainResult?.projectDomainVerification;
  return {
    alias: domain,
    aliasUrl: null,
    aliasAssigned: false,
    aliasError: message,
    aliasErrorCode: code,
    aliasStatus: error?.status,
    aliasDetails: error?.details || undefined,
    projectDomain: projectDomainResult?.projectDomain || domain,
    projectDomainAdded: projectDomainResult?.projectDomainAdded,
    projectDomainReady: false,
    projectDomainVerified: false,
    projectDomainVerification: verification,
    ...(error?.dnsVerificationResult || {}),
    projectDomainStatus: 'pending',
    projectDomainError: message,
    projectDomainErrorCode: code,
    domainSetupUrl: 'https://vercel.com/dashboard/domains'
  };
}

function toVercelProjectDomainFallback({ error, domain }) {
  const code = String(error?.code || '').trim();
  const message = error?.message || 'Vercel project domain setup failed.';
  return {
    alias: domain,
    aliasUrl: null,
    aliasAssigned: false,
    aliasError: message,
    aliasErrorCode: code || undefined,
    aliasStatus: error?.status,
    aliasDetails: error?.details || undefined,
    projectDomain: domain,
    projectDomainAdded: false,
    projectDomainReady: false,
    projectDomainError: message,
    projectDomainErrorCode: code || undefined,
    domainSetupUrl: 'https://vercel.com/dashboard/domains'
  };
}

function withVercelTeamScope(url, teamId) {
  if (!teamId) {
    return url;
  }

  const scopedUrl = new URL(url);
  scopedUrl.searchParams.set('teamId', teamId);
  return scopedUrl.toString();
}

function readVercelReadyState(deployment) {
  return String(deployment?.readyState || '').trim().toUpperCase();
}

function toVercelDeploymentResult(deployment) {
  return {
    id: deployment.id,
    url: deployment.url ? `https://${deployment.url}` : undefined,
    inspectUrl: deployment.inspectUrl
  };
}

async function fetchVercelDeploymentStatus({ token, deploymentId, teamId, fetchImpl = globalThis.fetch }) {
  const url = withVercelTeamScope(
    `https://api.vercel.com/v13/deployments/${encodeURIComponent(deploymentId)}`,
    teamId
  );
  const response = await fetchImpl(url, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Vercel deployment status error ${response.status}: ${errorText || 'Unknown error'}`);
  }

  return response.json();
}

async function waitForVercelDeploymentReady({
  token,
  deploymentId,
  teamId,
  initialDeployment,
  fetchImpl = globalThis.fetch,
  sleepImpl = delay,
  timeoutMs = DEFAULT_VERCEL_READY_TIMEOUT_MS,
  pollIntervalMs = DEFAULT_VERCEL_READY_POLL_INTERVAL_MS
}) {
  let latestDeployment = initialDeployment;
  let readyState = readVercelReadyState(latestDeployment);

  if (readyState === VERCEL_READY_STATE) {
    return latestDeployment;
  }

  if (VERCEL_FAILED_READY_STATES.has(readyState)) {
    throw new Error(`Vercel deployment ${deploymentId} ended with readyState ${readyState}; alias was not assigned.`);
  }

  const maxAttempts = Math.max(1, Math.ceil(timeoutMs / Math.max(pollIntervalMs, 1)));

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    await sleepImpl(pollIntervalMs);
    latestDeployment = await fetchVercelDeploymentStatus({
      token,
      deploymentId,
      teamId,
      fetchImpl
    });
    readyState = readVercelReadyState(latestDeployment);

    if (readyState === VERCEL_READY_STATE) {
      return latestDeployment;
    }

    if (VERCEL_FAILED_READY_STATES.has(readyState)) {
      throw new Error(`Vercel deployment ${deploymentId} ended with readyState ${readyState}; alias was not assigned.`);
    }
  }

  throw new Error(`Vercel deployment ${deploymentId} was not READY within ${Math.ceil(timeoutMs / 1000)} seconds; alias was not assigned.`);
}

async function createVercelDeployment({
  token,
  projectName,
  html,
  launchDomain,
  teamId,
  dnsTeamId,
  sleepImpl,
  readyTimeoutMs,
  readyPollIntervalMs,
  dnsVerifyRetryDelayMs,
  dnsVerifyRetryAttempts,
  fetchImpl = globalThis.fetch
}) {
  const sanitizedProjectName = sanitizeProjectName(projectName);
  const files = [
    { file: 'index.html', data: html },
    {
      file: 'README.md',
      data:
        '# Generated by 3dvr OpenAI Workbench\n\n'
        + 'This site was published directly from a chat response.\n'
    }
  ];

  const payload = {
    name: sanitizedProjectName,
    files,
    projectSettings: {
      framework: null
    },
    target: 'production'
  };

  const response = await fetchImpl(withVercelTeamScope('https://api.vercel.com/v13/deployments', teamId), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    const status = response.status;
    throw new Error(`Vercel error ${status}: ${errorText || 'Unknown error'}`);
  }

  const data = await response.json();
  let deployment = data;

  if (launchDomain?.domain && data.id) {
    let projectDomainResult = null;
    deployment = await waitForVercelDeploymentReady({
      token,
      deploymentId: data.id,
      teamId,
      initialDeployment: data,
      fetchImpl,
      sleepImpl,
      timeoutMs: readyTimeoutMs,
      pollIntervalMs: readyPollIntervalMs
    });

    try {
      projectDomainResult = await addVercelProjectDomain({
        token,
        projectName: sanitizedProjectName,
        domain: launchDomain.domain,
        teamId,
        fetchImpl
      });
    } catch (error) {
      return {
        ...toVercelDeploymentResult(deployment),
        ...toVercelProjectDomainFallback({
          error,
          domain: launchDomain.domain
        }),
        subdomain: launchDomain.subdomain,
        baseDomain: launchDomain.baseDomain,
        customDomain: launchDomain.customDomain || undefined
      };
    }

    if (projectDomainResult?.projectDomainReady === false) {
      try {
        const verifiedDomainResult = await verifyVercelProjectDomainWithDnsRetry({
          token,
          projectName: sanitizedProjectName,
          domain: launchDomain.domain,
          baseDomain: launchDomain.baseDomain,
          teamId,
          dnsTeamId,
          projectDomainResult,
          fetchImpl,
          sleepImpl,
          retryDelayMs: dnsVerifyRetryDelayMs,
          retryAttempts: dnsVerifyRetryAttempts
        });
        projectDomainResult = {
          ...projectDomainResult,
          ...verifiedDomainResult
        };
      } catch (error) {
        return {
          ...toVercelDeploymentResult(deployment),
          ...toVercelUnverifiedDomainFallback({
            domain: launchDomain.domain,
            projectDomainResult,
            error
          }),
          subdomain: launchDomain.subdomain,
          baseDomain: launchDomain.baseDomain,
          customDomain: launchDomain.customDomain || undefined
        };
      }
    }

    if (projectDomainResult?.projectDomainReady === false) {
      return {
        ...toVercelDeploymentResult(deployment),
        ...toVercelUnverifiedDomainFallback({
          domain: launchDomain.domain,
          projectDomainResult
        }),
        subdomain: launchDomain.subdomain,
        baseDomain: launchDomain.baseDomain,
        customDomain: launchDomain.customDomain || undefined
      };
    }

    let aliasResult;
    try {
      aliasResult = await assignVercelAlias({
        token,
        deploymentId: data.id,
        domain: launchDomain.domain,
        teamId,
        fetchImpl
      });
    } catch (error) {
      aliasResult = toVercelAliasFallback({
        error,
        domain: launchDomain.domain
      });
    }

    return {
      ...toVercelDeploymentResult(deployment),
      ...projectDomainResult,
      ...aliasResult,
      subdomain: launchDomain.subdomain,
      baseDomain: launchDomain.baseDomain,
      customDomain: launchDomain.customDomain || undefined
    };
  }

  return toVercelDeploymentResult(deployment);
}

export function createGithubPublishHandler(options = {}) {
  const {
    fetchImpl = globalThis.fetch,
    sleepImpl = delay,
    vercelToken = process.env.VERCEL_TOKEN,
    vercelTeamId: configuredVercelTeamId,
    vercelDnsTeamId: configuredVercelDnsTeamId,
    vercelReadyTimeoutMs,
    vercelReadyPollIntervalMs,
    vercelDnsVerifyRetryDelayMs,
    vercelDnsVerifyRetryAttempts,
    siteLaunchVercelProjectName,
    siteLaunchBaseDomain = process.env.SITE_LAUNCH_BASE_DOMAIN
  } = options;
  const vercelTeamId = resolveSiteLaunchVercelTeamId(configuredVercelTeamId);
  const vercelDnsTeamId = resolveSiteLaunchVercelDnsTeamId(configuredVercelDnsTeamId);

  return async function handler(req, res) {
    setCorsHeaders(res);

    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const body = req.body || {};
    const provider = parseProvider(req);

    if (provider === 'vercel') {
      const launchDomain = body.customDomain || body.domain || body.subdomain || body.siteSlug || body.slug || body.alias
        ? resolveLaunchDomain(body, { baseDomain: siteLaunchBaseDomain })
        : null;

      if ((body.customDomain || body.domain || body.subdomain || body.siteSlug || body.slug || body.alias) && !launchDomain) {
        return res.status(400).json({ error: 'Choose a valid launch address or custom domain.' });
      }

      const projectName = resolveSiteLaunchVercelProjectName(
        body.projectName,
        launchDomain,
        siteLaunchVercelProjectName
      );
      const validationError = validateVercelRequest(body, {
        defaultToken: vercelToken,
        projectName
      });
      if (validationError) {
        return res.status(400).json({ error: validationError });
      }

      try {
        const token = body.token || vercelToken;
        const result = await createVercelDeployment({
          token,
          projectName,
          html: body.html,
          launchDomain,
          teamId: vercelTeamId,
          dnsTeamId: vercelDnsTeamId,
          sleepImpl,
          readyTimeoutMs: vercelReadyTimeoutMs,
          readyPollIntervalMs: vercelReadyPollIntervalMs,
          dnsVerifyRetryDelayMs: vercelDnsVerifyRetryDelayMs,
          dnsVerifyRetryAttempts: vercelDnsVerifyRetryAttempts,
          fetchImpl
        });

        return res.status(200).json({
          ...result,
          projectName,
          requestedProjectName: body.projectName,
          createdAt: Date.now()
        });
      } catch (err) {
        return res.status(500).json({ error: err.message || 'Unexpected Vercel deployment error.' });
      }
    }

    const validationError = validateGithubRequest(body);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const branch = (body.branch || 'main').trim();
    const path = (body.path || 'index.html').replace(/^\/+/, '');
    const resolvedRepo = resolveGithubRepo(body);

    try {
      const result = await commitToGithub({
        token: body.token,
        repo: resolvedRepo,
        path,
        branch,
        content: body.content,
        message: body.message,
        fetchImpl,
      });

      return res.status(200).json({
        ...result,
        repo: resolvedRepo,
        message: body.message || 'Publish from 3dvr OpenAI workbench',
        createdAt: Date.now(),
      });
    } catch (err) {
      return res.status(500).json({ error: err.message || 'Unexpected GitHub publish error.' });
    }
  };
}

const handler = createGithubPublishHandler();
export default handler;

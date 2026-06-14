const setCorsHeaders = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
};

const DEFAULT_SITE_LAUNCH_VERCEL_TEAM_ID = 'team_KXuVUd00RMnDsjoqwdREcZ7J';

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

export function resolveLaunchDomain(body = {}, options = {}) {
  const baseDomain = String(options.baseDomain || process.env.SITE_LAUNCH_BASE_DOMAIN || '3dvr.tech')
    .trim()
    .toLowerCase()
    .replace(/^\.+|\.+$/g, '');

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
  const { token, projectName, html } = body || {};
  const effectiveToken = token || options.defaultToken;

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
    throw new Error(`Vercel alias error ${response.status}: ${errorText || 'Unknown error'}`);
  }

  const data = await response.json();
  return {
    alias: data.alias || domain,
    aliasUrl: `https://${data.alias || domain}`,
    aliasAssigned: true
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

async function createVercelDeployment({
  token,
  projectName,
  html,
  launchDomain,
  teamId,
  fetchImpl = globalThis.fetch
}) {
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
    name: sanitizeProjectName(projectName),
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
  const result = {
    id: data.id,
    url: data.url ? `https://${data.url}` : undefined,
    inspectUrl: data.inspectUrl
  };

  if (launchDomain?.domain && data.id) {
    const aliasResult = await assignVercelAlias({
      token,
      deploymentId: data.id,
      domain: launchDomain.domain,
      teamId,
      fetchImpl
    });

    return {
      ...result,
      ...aliasResult,
      subdomain: launchDomain.subdomain,
      baseDomain: launchDomain.baseDomain
    };
  }

  return result;
}

export function createGithubPublishHandler(options = {}) {
  const {
    fetchImpl = globalThis.fetch,
    vercelToken = process.env.VERCEL_TOKEN,
    vercelTeamId = process.env.SITE_LAUNCH_VERCEL_TEAM_ID || process.env.VERCEL_TEAM_ID || DEFAULT_SITE_LAUNCH_VERCEL_TEAM_ID,
    siteLaunchBaseDomain = process.env.SITE_LAUNCH_BASE_DOMAIN
  } = options;

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
      const validationError = validateVercelRequest(body, { defaultToken: vercelToken });
      if (validationError) {
        return res.status(400).json({ error: validationError });
      }

      try {
        const token = body.token || vercelToken;
        const launchDomain = body.subdomain || body.siteSlug || body.slug || body.alias
          ? resolveLaunchDomain(body, { baseDomain: siteLaunchBaseDomain })
          : null;

        if ((body.subdomain || body.siteSlug || body.slug || body.alias) && !launchDomain) {
          return res.status(400).json({ error: 'Choose a valid, available 3dvr.tech subdomain.' });
        }

        const result = await createVercelDeployment({
          token,
          projectName: body.projectName,
          html: body.html,
          launchDomain,
          teamId: body.teamId || vercelTeamId,
          fetchImpl
        });

        return res.status(200).json({
          ...result,
          projectName: body.projectName,
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

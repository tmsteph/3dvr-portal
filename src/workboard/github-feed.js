const REPOSITORY = 'tmsteph/3dvr-portal';
const API_VERSION = '2022-11-28';
const ITEM_LIMIT = 40;
const CACHE_TTL_MS = 60_000;
const STALE_TTL_MS = 5 * 60_000;

let cachedFeed = null;
let cachedAt = 0;
let refreshPromise = null;

function githubHeaders(config = process.env) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': '3dvr-agent-workboard',
    'X-GitHub-Api-Version': API_VERSION
  };
  const token = String(config.GITHUB_TOKEN || config.GH_TOKEN || '').trim();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function normalizeItem(item = {}) {
  const isPullRequest = Boolean(item.pull_request);
  return {
    id: String(item.number || item.id || ''),
    number: Number(item.number || 0),
    kind: isPullRequest ? 'github-pr' : 'github-issue',
    title: String(item.title || '').slice(0, 240),
    body: String(item.body || '').slice(0, 2000),
    state: String(item.state || 'open'),
    merged: Boolean(item.pull_request?.merged_at),
    url: String(item.html_url || ''),
    user: String(item.user?.login || ''),
    createdAt: String(item.created_at || ''),
    updatedAt: String(item.updated_at || ''),
    closedAt: String(item.closed_at || ''),
    labels: Array.isArray(item.labels)
      ? item.labels.map(label => String(label?.name || '')).filter(Boolean).slice(0, 8)
      : []
  };
}

function cachedPayload(maxAgeMs, now = Date.now()) {
  if (!cachedFeed || !cachedAt) return null;
  if (now - cachedAt > maxAgeMs) return null;
  return cachedFeed;
}

function sendFeed(res, payload, { stale = false } = {}) {
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
  if (stale) res.setHeader('Warning', '110 - Response is stale');
  return res.status(200).json(payload);
}

async function refreshFeed({ fetchImpl, config }) {
  if (!refreshPromise) {
    const url = `https://api.github.com/repos/${REPOSITORY}/issues?state=all&per_page=${ITEM_LIMIT}&sort=updated&direction=desc`;
    refreshPromise = (async () => {
      const response = await fetchImpl(url, { headers: githubHeaders(config) });
      if (!response.ok) {
        const error = new Error('GitHub work feed is temporarily unavailable.');
        error.status = response.status;
        throw error;
      }

      const payload = await response.json();
      const items = Array.isArray(payload) ? payload.map(normalizeItem).filter(item => item.id) : [];
      cachedFeed = { ok: true, repository: REPOSITORY, items };
      cachedAt = Date.now();
      return cachedFeed;
    })().finally(() => {
      refreshPromise = null;
    });
  }

  return refreshPromise;
}

export function __resetWorkboardGithubCacheForTests() {
  cachedFeed = null;
  cachedAt = 0;
  refreshPromise = null;
}

export function createWorkboardGithubHandler(options = {}) {
  const {
    fetchImpl,
    config = process.env
  } = options;

  return async function workboardGithubHandler(req, res) {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const fresh = cachedPayload(CACHE_TTL_MS);
    if (fresh) return sendFeed(res, fresh);

    try {
      const payload = await refreshFeed({
        fetchImpl: fetchImpl || ((...args) => globalThis.fetch(...args)),
        config
      });
      return sendFeed(res, payload);
    } catch (error) {
      const stale = cachedPayload(STALE_TTL_MS);
      if (stale) return sendFeed(res, stale, { stale: true });
      return sendFeed(res, {
        ok: true,
        repository: REPOSITORY,
        items: [],
        degraded: true,
        error: error?.message || 'GitHub work feed is temporarily unavailable.',
        ...(Number.isFinite(error?.status) ? { status: error.status } : {})
      });
    }
  };
}

const handler = createWorkboardGithubHandler();
export default handler;

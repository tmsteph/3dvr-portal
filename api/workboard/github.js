const REPOSITORY = 'tmsteph/3dvr-portal';
const API_VERSION = '2022-11-28';
const ITEM_LIMIT = 40;

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

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const url = `https://api.github.com/repos/${REPOSITORY}/issues?state=all&per_page=${ITEM_LIMIT}&sort=updated&direction=desc`;

  try {
    const response = await fetch(url, { headers: githubHeaders() });
    if (!response.ok) {
      return res.status(502).json({
        error: 'GitHub work feed is temporarily unavailable.',
        status: response.status
      });
    }

    const payload = await response.json();
    const items = Array.isArray(payload) ? payload.map(normalizeItem).filter(item => item.id) : [];

    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    return res.status(200).json({ ok: true, repository: REPOSITORY, items });
  } catch (error) {
    return res.status(502).json({
      error: error?.message || 'GitHub work feed is temporarily unavailable.'
    });
  }
}

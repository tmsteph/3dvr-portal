const setCorsHeaders = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
};

function validateRequest(body) {
  const { token, repo, content } = body || {};

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

export function createGithubPublishHandler(options = {}) {
  const { fetchImpl = globalThis.fetch } = options;

  return async function handler(req, res) {
    setCorsHeaders(res);

    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const body = req.body || {};
    const validationError = validateRequest(body);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const branch = (body.branch || 'main').trim();
    const path = (body.path || 'index.html').replace(/^\/+/, '');

    try {
      const result = await commitToGithub({
        token: body.token,
        repo: body.repo.trim(),
        path,
        branch,
        content: body.content,
        message: body.message,
        fetchImpl,
      });

      return res.status(200).json({
        ...result,
        repo: body.repo.trim(),
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

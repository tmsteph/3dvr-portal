function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function resolveBuildInfo(config = process.env) {
  return {
    environment: String(config?.VERCEL_ENV || config?.NODE_ENV || 'development').trim(),
    commitSha: String(config?.VERCEL_GIT_COMMIT_SHA || config?.NEXT_PUBLIC_COMMIT_SHA || '').trim() || null,
    branch: String(config?.VERCEL_GIT_COMMIT_REF || '').trim() || null
  };
}

export function createHealthHandler(options = {}) {
  const { config = process.env, now = () => new Date() } = options;

  return async function handler(req, res) {
    setCorsHeaders(res);

    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const buildInfo = resolveBuildInfo(config);
    const checkedAt = now();

    return res.status(200).json({
      ok: true,
      service: '3dvr-portal',
      checkedAt: checkedAt instanceof Date ? checkedAt.toISOString() : new Date(checkedAt).toISOString(),
      ...buildInfo
    });
  };
}

const handler = createHealthHandler();
export default handler;

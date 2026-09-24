const CONTROL_KEY = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAINC9Py4FI0s8s7xt4DneGtA3xgdV2lkd6o129vMjjNcx openclaw-control-tmsteph-2026-07-09';

function text(res, status, body) {
  res.status(status);
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  return res.send(body);
}

export default function handler(req, res) {
  if (req.method === 'GET') {
    return text(res, 200, CONTROL_KEY + '\n');
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return text(res, 405, 'Method not allowed\n');
  }

  const encoded = typeof req.body === 'string'
    ? new URLSearchParams(req.body).get('key')
    : req.body && typeof req.body === 'object'
      ? req.body.key
      : '';

  if (!encoded || typeof encoded !== 'string') {
    return text(res, 400, 'Missing key\n');
  }

  let key = '';
  try {
    key = Buffer.from(encoded.trim(), 'base64').toString('utf8').trim();
  } catch {
    return text(res, 400, 'Bad key encoding\n');
  }

  if (!/^ssh-ed25519\s+[A-Za-z0-9+/=]+(?:\s+.*)?$/.test(key) || key.length > 512) {
    return text(res, 400, 'Invalid public key\n');
  }

  console.log('UT_PAIR_PUBLIC_KEY', key);
  return text(res, 200, 'PAIR_RECEIVED\n');
}

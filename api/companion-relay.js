const MAX_ENVELOPE_CHARS = 60000;

function send(res, status, body) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.status(status).json(body);
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return send(res, 200, {
      ok: true,
      relay: '3dvr-companion-encrypted-v1',
      storage: 'none',
      plaintextAccepted: false,
    });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return send(res, 405, { ok: false, error: 'method_not_allowed' });
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const relayId = typeof body.relayId === 'string' ? body.relayId : '';
  const envelope = typeof body.envelope === 'string' ? body.envelope : '';

  if (!/^[A-Za-z0-9_-]{8,80}$/.test(relayId)) {
    return send(res, 400, { ok: false, error: 'invalid_relay_id' });
  }
  if (!/^[A-Za-z0-9+/=\r\n]+$/.test(envelope) || envelope.length < 32 || envelope.length > MAX_ENVELOPE_CHARS) {
    return send(res, 400, { ok: false, error: 'invalid_envelope' });
  }

  // Deliberately log ciphertext only. Companion message plaintext must never be
  // included in request metadata, GitHub issues, or application logs.
  console.log(`3DVR_COMPANION_RELAY_V1 ${relayId} ${envelope.replace(/\s+/g, '')}`);

  return send(res, 202, {
    ok: true,
    relayId,
    accepted: true,
    storage: 'runtime-ciphertext-log-only',
  });
}

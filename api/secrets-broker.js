import fs from 'node:fs';
import http from 'node:http';
import { resolveSeaAuthMaxAgeMs, verifySignedSeaPayload } from '../src/auth/sea.js';
import { resolveOperatorDeveloperPolicy } from '../src/operator/developer-access.js';

function normalizeText(value = '', max = 500) {
  return String(value || '').trim().slice(0, max);
}

function requestOrigin(req) {
  const proto = normalizeText(req?.headers?.['x-forwarded-proto']) || 'https';
  const host = normalizeText(req?.headers?.['x-forwarded-host'] || req?.headers?.host);
  return host ? `${proto}://${host}` : '';
}

function ownerFromPolicy(identity, config) {
  const policy = resolveOperatorDeveloperPolicy(config);
  const alias = normalizeText(identity?.alias).toLowerCase();
  const pub = normalizeText(identity?.pub);
  return policy.ownerPubs.has(pub) || policy.ownerBindings.get(alias) === pub;
}

function readPortalToken(config) {
  const file = normalizeText(config.THREEDVR_SECRETS_BROKER_TOKEN_FILE || '/etc/3dvr/secrets-broker/portal.token', 1000);
  try { return fs.readFileSync(file, 'utf8').trim(); }
  catch { return ''; }
}

function brokerHttpRequest({ config, method = 'GET', path = '/v1/status', payload }) {
  const socketPath = normalizeText(config.THREEDVR_SECRETS_BROKER_SOCKET || '/run/3dvr-secrets-broker/broker.sock', 1000);
  const token = readPortalToken(config);
  if (!token) return Promise.reject(new Error('broker portal credential is unavailable'));
  const body = payload == null ? '' : JSON.stringify(payload);
  return new Promise((resolve, reject) => {
    const request = http.request({
      socketPath,
      path,
      method,
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/json',
        ...(body ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } : {}),
      },
    }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => {
        let parsed = {};
        try { parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch {}
        resolve({ status: response.statusCode || 500, body: parsed });
      });
    });
    request.setTimeout(5000, () => request.destroy(new Error('broker request timed out')));
    request.on('error', reject);
    if (body) request.write(body);
    request.end();
  });
}

async function authorizeOwner(req, body, action, { config, verify }) {
  const auth = await verify(body, {
    scope: 'secrets-broker-owner',
    expectedOrigin: requestOrigin(req) || normalizeText(config.PORTAL_ORIGIN),
    config,
    maxAgeMs: resolveSeaAuthMaxAgeMs(config),
  });
  if (!auth.ok) return { ok: false, status: 401, reason: auth.reason || 'Owner proof could not be verified.' };
  if (auth.identity.action !== action) return { ok: false, status: 401, reason: 'Owner proof action did not match this request.' };
  if (!ownerFromPolicy(auth.identity, config)) return { ok: false, status: 403, reason: 'Only the 3DVR owner can manage secret approvals.' };
  if ((action === 'approve' || action === 'deny') && normalizeText(auth.verified?.approvalId) !== normalizeText(body.approvalId)) {
    return { ok: false, status: 401, reason: 'Owner proof did not match this approval.' };
  }
  return { ok: true, identity: auth.identity };
}

export function createSecretsBrokerHandler(options = {}) {
  const config = options.config || process.env;
  const verify = options.verify || verifySignedSeaPayload;
  const brokerRequest = options.brokerRequest || (request => brokerHttpRequest({ config, ...request }));

  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
    const body = req.body || {};
    const action = normalizeText(body.action, 40);
    if (!['status', 'approvals', 'approve', 'deny'].includes(action)) return res.status(400).json({ ok: false, error: 'Unknown broker action.' });
    const auth = await authorizeOwner(req, body, action, { config, verify });
    if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.reason });

    let request;
    if (action === 'status') request = { method: 'GET', path: '/v1/status' };
    else if (action === 'approvals') request = { method: 'GET', path: '/v1/approvals?status=pending' };
    else {
      const approvalId = normalizeText(body.approvalId, 200);
      if (!/^apr-[a-z0-9-]{10,}$/i.test(approvalId)) return res.status(400).json({ ok: false, error: 'A valid approval id is required.' });
      request = {
        method: 'POST',
        path: `/v1/approvals/${encodeURIComponent(approvalId)}/${action}`,
        payload: { actor: auth.identity.alias || auth.identity.pub },
      };
    }

    try {
      const result = await brokerRequest(request);
      return res.status(result.status).json(result.body);
    } catch (error) {
      return res.status(503).json({ ok: false, error: 'OVH secrets broker is unavailable.', detail: normalizeText(error.message, 200) });
    }
  };
}

export default createSecretsBrokerHandler();

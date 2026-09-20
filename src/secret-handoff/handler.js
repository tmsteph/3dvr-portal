import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createHash, randomBytes, timingSafeEqual, webcrypto } from 'node:crypto';
import { resolveSeaAuthMaxAgeMs, verifySignedSeaPayload } from '../auth/sea.js';
import { resolveOperatorDeveloperPolicy } from '../operator/developer-access.js';

const subtle = webcrypto.subtle;
const DEFAULT_STATE_FILE = '/var/lib/3dvr/secret-handoff/state.json';
const DEFAULT_PUBLIC_ORIGIN = 'https://portal.3dvr.tech';
const MAX_SECRET_BYTES = 64 * 1024;

function text(value = '', max = 1000) {
  return String(value ?? '').trim().slice(0, max);
}

function stateFile(config = {}) {
  return text(config.THREEDVR_SECRET_HANDOFF_STATE || DEFAULT_STATE_FILE, 2000);
}

function trustedPortalOrigins(config = {}) {
  return new Set(String(
    config.THREEDVR_SECRET_HANDOFF_ALLOWED_ORIGINS
      || config.THREEDVR_SECRETS_BROKER_ALLOWED_ORIGINS
      || 'https://portal.3dvr.tech,https://3dvr-portal.vercel.app'
  ).split(',').map(value => text(value, 1000)).filter(Boolean));
}

function requestOrigin(req, config = {}) {
  const browserOrigin = text(req?.headers?.origin, 1000);
  if (browserOrigin && trustedPortalOrigins(config).has(browserOrigin)) return browserOrigin;
  const proto = text(req?.headers?.['x-forwarded-proto']) || 'https';
  const host = text(req?.headers?.['x-forwarded-host'] || req?.headers?.host);
  return host ? `${proto}://${host}` : '';
}

function ownerFromPolicy(identity, config) {
  const policy = resolveOperatorDeveloperPolicy(config);
  const alias = text(identity?.alias).toLowerCase();
  const pub = text(identity?.pub);
  return policy.ownerPubs.has(pub) || policy.ownerBindings.get(alias) === pub;
}

function sha256(value) {
  return createHash('sha256').update(String(value), 'utf8').digest('hex');
}

export function handoffRequestHash({ key = '', label = '', purpose = '', recipient = '', ttlMinutes = 1440 } = {}) {
  const normalized = [
    text(key, 500),
    text(label, 200),
    text(purpose, 1000),
    text(recipient, 200),
    Math.max(10, Math.min(Number(ttlMinutes) || 1440, 10080)),
  ];
  return sha256(JSON.stringify(normalized));
}

function secureTokenMatch(expectedHash, token) {
  const expected = Buffer.from(String(expectedHash || ''), 'hex');
  const actual = Buffer.from(sha256(token), 'hex');
  return expected.length === actual.length && expected.length > 0 && timingSafeEqual(expected, actual);
}

function readState(config = {}) {
  const file = stateFile(config);
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!parsed || typeof parsed !== 'object') throw new Error('invalid state');
    return { version: 1, requests: parsed.requests && typeof parsed.requests === 'object' ? parsed.requests : {} };
  } catch (error) {
    if (error?.code === 'ENOENT') return { version: 1, requests: {} };
    throw error;
  }
}

function writeState(config, state) {
  const file = stateFile(config);
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(state, null, 2) + '\n', { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  fs.chmodSync(temp, 0o600);
  fs.renameSync(temp, file);
}

function pruneState(state, now = Date.now()) {
  let changed = false;
  for (const [id, record] of Object.entries(state.requests || {})) {
    const expiresAt = Date.parse(record?.expiresAt || '');
    const completedAt = Date.parse(record?.submittedAt || record?.cancelledAt || '');
    if ((Number.isFinite(expiresAt) && expiresAt < now - 7 * 86400000)
      || (Number.isFinite(completedAt) && completedAt < now - 30 * 86400000)) {
      delete state.requests[id];
      changed = true;
    }
  }
  return changed;
}

function readPortalToken(config) {
  const file = text(config.THREEDVR_SECRETS_BROKER_TOKEN_FILE || '/etc/3dvr/secrets-broker/portal.token', 1000);
  try { return fs.readFileSync(file, 'utf8').trim(); }
  catch { return ''; }
}

function brokerHttpRequest({ config, method = 'POST', endpoint = '/v1/store', payload }) {
  const socketPath = text(config.THREEDVR_SECRETS_BROKER_SOCKET || '/run/3dvr-secrets-broker/broker.sock', 1000);
  const token = readPortalToken(config);
  if (!token) return Promise.reject(new Error('broker portal credential is unavailable'));
  const body = JSON.stringify(payload || {});
  return new Promise((resolve, reject) => {
    const request = http.request({
      socketPath,
      path: endpoint,
      method,
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/json',
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body),
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
    request.setTimeout(8000, () => request.destroy(new Error('broker request timed out')));
    request.on('error', reject);
    request.write(body);
    request.end();
  });
}

async function authorizeOwner(req, body, { config, verify }) {
  const auth = await verify(body, {
    scope: 'secret-handoff-owner',
    expectedOrigin: requestOrigin(req, config) || text(config.PORTAL_ORIGIN),
    config,
    maxAgeMs: resolveSeaAuthMaxAgeMs(config),
  });
  if (!auth.ok) return { ok: false, status: 401, reason: auth.reason || 'Owner proof could not be verified.' };
  if (auth.identity.action !== 'create') return { ok: false, status: 401, reason: 'Owner proof action did not match this request.' };
  if (!ownerFromPolicy(auth.identity, config)) return { ok: false, status: 403, reason: 'Only the 3DVR owner can create secret handoffs.' };
  const expected = handoffRequestHash(body);
  if (text(auth.verified?.handoffRequestHash, 100) !== expected) {
    return { ok: false, status: 401, reason: 'Owner proof did not match this handoff request.' };
  }
  return { ok: true, identity: auth.identity };
}

async function createRequest(body, config) {
  const key = text(body.key, 500);
  const label = text(body.label || body.key, 200);
  const purpose = text(body.purpose, 1000);
  const recipient = text(body.recipient, 200);
  const ttlMinutes = Math.max(10, Math.min(Number(body.ttlMinutes) || 1440, 10080));
  if (!key || !label) {
    const error = new Error('A destination name and human-readable label are required.');
    error.statusCode = 400;
    throw error;
  }

  const id = `sh-${randomBytes(12).toString('base64url')}`;
  const token = randomBytes(32).toString('base64url');
  const keyPair = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const publicKey = await subtle.exportKey('jwk', keyPair.publicKey);
  const privateKey = await subtle.exportKey('jwk', keyPair.privateKey);
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + ttlMinutes * 60000).toISOString();
  const state = readState(config);
  pruneState(state);
  state.requests[id] = {
    id, key, label, purpose, recipient, createdAt, expiresAt,
    status: 'pending',
    tokenHash: sha256(token),
    publicKey,
    privateKey,
    protocol: '3dvr-secret-handoff/1',
  };
  writeState(config, state);

  const origin = text(config.THREEDVR_SECRET_HANDOFF_PUBLIC_ORIGIN || DEFAULT_PUBLIC_ORIGIN, 1000).replace(/\/+$/, '');
  return {
    ok: true,
    id,
    expiresAt,
    shareUrl: `${origin}/secret-handoff/?id=${encodeURIComponent(id)}#token=${token}`,
    protocol: '3dvr-secret-handoff/1',
  };
}

function authenticatedRecord(body, config) {
  const id = text(body.id, 200);
  const token = text(body.token, 500);
  if (!/^sh-[A-Za-z0-9_-]{12,}$/.test(id) || token.length < 32) return { error: 'This secure handoff link is invalid.', status: 404 };
  const state = readState(config);
  const changed = pruneState(state);
  if (changed) writeState(config, state);
  const record = state.requests[id];
  if (!record || !secureTokenMatch(record.tokenHash, token)) return { error: 'This secure handoff link is invalid.', status: 404 };
  return { state, record };
}

function describeRecord(record) {
  const expired = Date.parse(record.expiresAt) <= Date.now();
  return {
    id: record.id,
    label: record.label,
    purpose: record.purpose,
    recipient: record.recipient,
    expiresAt: record.expiresAt,
    status: expired && record.status === 'pending' ? 'expired' : record.status,
    protocol: record.protocol,
    publicKey: !expired && record.status === 'pending' ? record.publicKey : undefined,
    submittedAt: record.submittedAt || undefined,
  };
}

function decodeBase64url(value, maxBytes) {
  const input = text(value, Math.ceil(maxBytes * 1.5) + 64);
  const buffer = Buffer.from(input, 'base64url');
  if (!buffer.length || buffer.length > maxBytes) throw new Error('invalid encoded value');
  return buffer;
}

async function decryptEnvelope(record, envelope) {
  try {
    if (!envelope || envelope.v !== 1 || envelope.kem !== 'P-256-ECDH'
      || envelope.kdf !== 'HKDF-SHA256' || envelope.aead !== 'AES-256-GCM') {
      throw new Error('unsupported envelope');
    }
    const privateKey = await subtle.importKey('jwk', record.privateKey, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
    const ephemeralKey = await subtle.importKey('jwk', envelope.epk, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
    const shared = await subtle.deriveBits({ name: 'ECDH', public: ephemeralKey }, privateKey, 256);
    const hkdfKey = await subtle.importKey('raw', shared, 'HKDF', false, ['deriveKey']);
    const salt = decodeBase64url(envelope.salt, 64);
    const iv = decodeBase64url(envelope.iv, 32);
    if (iv.length !== 12) throw new Error('invalid iv');
    const info = Buffer.from(`3dvr-secret-handoff:v1:${record.id}`, 'utf8');
    const aesKey = await subtle.deriveKey(
      { name: 'HKDF', hash: 'SHA-256', salt, info },
      hkdfKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt'],
    );
    const ciphertext = decodeBase64url(envelope.ciphertext, MAX_SECRET_BYTES + 4096);
    const plaintext = await subtle.decrypt({ name: 'AES-GCM', iv, additionalData: info, tagLength: 128 }, aesKey, ciphertext);
    const parsed = JSON.parse(Buffer.from(plaintext).toString('utf8'));
    const value = typeof parsed?.value === 'string' ? parsed.value : '';
    if (!value || Buffer.byteLength(value, 'utf8') > MAX_SECRET_BYTES) throw new Error('invalid plaintext');
    return value;
  } catch {
    const error = new Error('Encrypted handoff could not be opened.');
    error.statusCode = 400;
    throw error;
  }
}

export function createSecretHandoffHandler(options = {}) {
  const config = options.config || process.env;
  const verify = options.verify || verifySignedSeaPayload;
  const brokerRequest = options.brokerRequest || (request => brokerHttpRequest({ config, ...request }));

  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
    const body = req.body || {};
    const action = text(body.action, 30);

    if (action === 'create') {
      const auth = await authorizeOwner(req, body, { config, verify });
      if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.reason });
      try {
        return res.status(201).json(await createRequest(body, config));
      } catch (error) {
        return res.status(error?.statusCode || 500).json({ ok: false, error: text(error.message, 300) || 'Could not create secure handoff.' });
      }
    }

    if (action === 'describe' || action === 'submit') {
      let access;
      try { access = authenticatedRecord(body, config); }
      catch { return res.status(503).json({ ok: false, error: 'Secure handoff storage is unavailable.' }); }
      if (access.error) return res.status(access.status).json({ ok: false, error: access.error });
      const { state, record } = access;

      if (action === 'describe') return res.status(200).json({ ok: true, request: describeRecord(record) });

      if (record.status !== 'pending') return res.status(409).json({ ok: false, error: record.status === 'stored' ? 'This secret was already received.' : 'This handoff is no longer active.' });
      if (Date.parse(record.expiresAt) <= Date.now()) return res.status(410).json({ ok: false, error: 'This secure handoff link has expired.' });

      let value;
      try { value = await decryptEnvelope(record, body.envelope); }
      catch (error) { return res.status(error?.statusCode || 400).json({ ok: false, error: error.message }); }

      let result;
      try {
        result = await brokerRequest({
          method: 'POST',
          endpoint: '/v1/store',
          payload: {
            secret: 'bitwarden.writer',
            capability: 'secret.write',
            scope: 'secrets:3dvr-agent',
            purpose: `Secret handoff: ${record.purpose || record.label}`,
            key: record.key,
            value,
            note: `Received through 3DVR Secret Handoff ${record.id}${record.recipient ? ` from ${record.recipient}` : ''}.`,
          },
        });
      } catch (error) {
        value = '';
        return res.status(503).json({ ok: false, error: '3DVR Secrets is temporarily unavailable. Your encrypted handoff was not consumed.' });
      }
      value = '';

      if (result.status < 200 || result.status >= 300 || !result.body?.ok || !result.body?.stored?.id) {
        return res.status(result.status >= 400 ? result.status : 503).json({
          ok: false,
          error: '3DVR Secrets did not confirm storage. Your encrypted handoff was not consumed.',
        });
      }

      record.status = 'stored';
      record.submittedAt = new Date().toISOString();
      record.receiptId = text(result.body.stored.id, 500);
      delete record.privateKey;
      delete record.publicKey;
      state.requests[record.id] = record;
      writeState(config, state);
      return res.status(201).json({
        ok: true,
        stored: true,
        receipt: { id: record.id, label: record.label, submittedAt: record.submittedAt },
      });
    }

    return res.status(400).json({ ok: false, error: 'Unknown handoff action.' });
  };
}

export default createSecretHandoffHandler();

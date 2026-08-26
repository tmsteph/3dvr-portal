import { createHash, randomUUID } from 'node:crypto';
import { verifySignedSeaPayload, resolveSeaAuthMaxAgeMs } from '../auth/sea.js';

const RELAY_BASE_URL = 'https://gun-relay-3dvr.fly.dev';
export const REMOTE_COMPANION_CAPABILITIES = new Set([
  'health',
  'device.status',
  'app.open_known',
  'url.open',
  'messages.notification.read',
  'messages.notification.reply',
]);
const ALLOWED_APP_ALIASES = new Set([
  'settings',
  'chatgpt',
  'maps',
  'gmail',
  'chrome',
  'calendar',
  'camera',
  'messages',
]);
const RESULT_TIMEOUT_MS = 10_000;
const RESULT_POLL_MS = 400;
const text = (value = '') => String(value || '').trim();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function requestOrigin(req) {
  const proto = text(req?.headers?.['x-forwarded-proto'] || req?.headers?.['X-Forwarded-Proto']);
  const forwardedHost = text(req?.headers?.['x-forwarded-host'] || req?.headers?.['X-Forwarded-Host']);
  const host = forwardedHost || text(req?.headers?.host || req?.headers?.Host);
  const scheme = proto || (host.includes('localhost') || host.includes('127.0.0.1') ? 'http' : 'https');
  return host ? `${scheme}://${host}` : '';
}

function normalizeArguments(capabilityId, value) {
  const args = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  if (capabilityId === 'health' || capabilityId === 'device.status') {
    if (Object.keys(args).length) throw new Error('capability does not accept arguments');
    return {};
  }
  if (capabilityId === 'app.open_known') {
    const alias = text(args.alias).toLowerCase();
    if (!ALLOWED_APP_ALIASES.has(alias)) throw new Error('unsupported app alias');
    return { alias };
  }
  if (capabilityId === 'url.open') {
    const raw = text(args.url);
    if (!raw || raw.length > 2048) throw new Error('valid https url required');
    let parsed;
    try { parsed = new URL(raw); } catch (_error) { throw new Error('valid https url required'); }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
      throw new Error('valid https url required');
    }
    return { url: parsed.toString() };
  }
  if (capabilityId === 'messages.notification.read') {
    const keys = Object.keys(args);
    if (keys.some((key) => key !== 'limit')) throw new Error('unsupported message read argument');
    if (!keys.length) return {};
    const limit = Number(args.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 20) throw new Error('message read limit must be 1-20');
    return { limit };
  }
  if (capabilityId === 'messages.notification.reply') {
    const key = text(args.key);
    const replyText = text(args.text);
    if (!key || key.length > 512) throw new Error('valid message key required');
    if (!replyText || replyText.length > 4000) throw new Error('reply text must be 1-4000 characters');
    return { key, text: replyText };
  }
  throw new Error('capability is not enabled for remote invocation');
}

function argumentDigest(argumentsValue) {
  const canonical = JSON.stringify(argumentsValue);
  return createHash('sha256').update(canonical).digest('hex').slice(0, 24);
}

export function companionSignedAction(mode, capabilityId, argumentsValue = {}) {
  if (mode === 'devices') return 'devices';
  return `invoke:${capabilityId}:${argumentDigest(argumentsValue)}`;
}

async function relayFetch(fetchImpl, token, path, options = {}) {
  if (!token) throw new Error('Vercel workload identity unavailable');
  const response = await fetchImpl(`${RELAY_BASE_URL}${path}`, {
    ...options,
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${token}`,
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
    signal: AbortSignal.timeout(8_000),
  });
  const raw = await response.text();
  let payload;
  try { payload = raw ? JSON.parse(raw) : {}; }
  catch (_error) { throw new Error(`relay returned malformed JSON (${response.status})`); }
  return { status: response.status, ok: response.ok, payload };
}

async function activeDevices(fetchImpl, token) {
  const response = await relayFetch(fetchImpl, token, '/relay/v1/devices');
  if (!response.ok || !response.payload?.ok || !Array.isArray(response.payload.devices)) {
    throw new Error(`relay device discovery failed (${response.status})`);
  }
  return response.payload.devices
    .filter((device) => device && typeof device.deviceId === 'string')
    .map((device) => ({ deviceId: device.deviceId, expiresAt: Number(device.expiresAt) || null }));
}

function chooseDevice(devices, requestedId) {
  const requested = text(requestedId);
  if (requested) return devices.find((device) => device.deviceId === requested) || null;
  return devices.length === 1 ? devices[0] : null;
}

async function invoke(fetchImpl, token, deviceId, capabilityId, argumentsValue) {
  const queued = await relayFetch(fetchImpl, token, '/relay/v1/commands', {
    method: 'POST',
    body: JSON.stringify({
      requestId: `portal_${randomUUID().replaceAll('-', '')}`,
      deviceId,
      capabilityId,
      arguments: argumentsValue,
      ttlMs: 15_000,
    }),
  });
  if (queued.status !== 201 || !queued.payload?.ok || !queued.payload.requestId) {
    throw new Error(`relay command enqueue failed (${queued.status})`);
  }
  const requestId = queued.payload.requestId;
  const deadline = Date.now() + RESULT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const result = await relayFetch(fetchImpl, token, `/relay/v1/results/${encodeURIComponent(requestId)}`);
    if (result.status === 200 && result.payload?.ok) return result.payload;
    if (result.status !== 202) throw new Error(`relay result failed (${result.status})`);
    await sleep(RESULT_POLL_MS);
  }
  throw new Error('Companion did not answer before the command expired');
}

export function createCompanionCommandHandler(options = {}) {
  const { config = process.env, fetchImpl = globalThis.fetch, verifyAuth = verifySignedSeaPayload } = options;
  return async function handleCompanionCommand(req, res) {
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method Not Allowed' });

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const mode = text(body.companionMode || body.commandMode || body.mode || body.action);
    const capabilityId = text(body.capabilityId);
    if (mode !== 'devices' && mode !== 'invoke') return res.status(400).json({ ok: false, error: 'unsupported mode' });
    if (mode === 'invoke' && !REMOTE_COMPANION_CAPABILITIES.has(capabilityId)) {
      return res.status(403).json({ ok: false, error: 'capability is not enabled for remote invocation' });
    }

    let argumentsValue = {};
    try {
      argumentsValue = mode === 'invoke' ? normalizeArguments(capabilityId, body.arguments) : {};
    } catch (error) {
      return res.status(400).json({ ok: false, error: error instanceof Error ? error.message : 'invalid arguments' });
    }

    const signedAction = companionSignedAction(mode, capabilityId, argumentsValue);
    const origin = text(body.origin || requestOrigin(req) || config.PORTAL_ORIGIN);
    const auth = await verifyAuth(body, {
      scope: 'companion-command',
      expectedOrigin: origin,
      config,
      maxAgeMs: resolveSeaAuthMaxAgeMs(config),
      messages: {
        missing: 'Sign in again to control Companion.', verifyError: 'Refresh your portal sign-in to control Companion.',
        invalid: 'Refresh your portal sign-in to control Companion.', wrongScope: 'Companion proof had the wrong scope.',
        wrongPub: 'Companion proof did not match this portal account.', missingTimestamp: 'Companion proof was missing a timestamp.',
        expired: 'Companion proof expired.', wrongOrigin: 'Companion proof was issued for a different portal origin.',
      },
    });
    if (!auth.ok || auth.identity?.action !== signedAction) {
      return res.status(401).json({ ok: false, error: auth.reason || 'Companion action proof did not match this exact request.' });
    }

    const oidcToken = text(config.VERCEL_OIDC_TOKEN);
    if (!oidcToken) return res.status(503).json({ ok: false, error: 'Companion workload identity is unavailable' });

    try {
      const devices = await activeDevices(fetchImpl, oidcToken);
      if (mode === 'devices') return res.status(200).json({ ok: true, devices, capabilities: [...REMOTE_COMPANION_CAPABILITIES] });
      const device = chooseDevice(devices, body.deviceId);
      if (!device) {
        return res.status(devices.length === 0 ? 503 : 409).json({
          ok: false,
          error: devices.length === 0 ? 'No Companion device is connected to the direct relay.' : 'Multiple Companion devices are connected; choose a device.',
          devices: devices.map(({ deviceId, expiresAt }) => ({ deviceId, expiresAt })),
        });
      }
      const result = await invoke(fetchImpl, oidcToken, device.deviceId, capabilityId, argumentsValue);
      return res.status(200).json({
        ok: Boolean(result.commandOk), deviceId: device.deviceId, capabilityId,
        code: result.code || null, data: result.data && typeof result.data === 'object' ? result.data : {},
        completedAt: result.completedAt || null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Companion relay failed';
      console.error('Companion command proxy failed:', message);
      return res.status(502).json({ ok: false, error: message });
    }
  };
}

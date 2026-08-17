import { randomUUID } from 'node:crypto';
import { verifySignedSeaPayload, resolveSeaAuthMaxAgeMs } from '../auth/sea.js';

const RELAY_BASE_URL = 'https://gun-relay-3dvr.fly.dev';
export const READ_ONLY_COMPANION_CAPABILITIES = new Set(['health', 'device.status']);
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

async function invoke(fetchImpl, token, deviceId, capabilityId) {
  const queued = await relayFetch(fetchImpl, token, '/relay/v1/commands', {
    method: 'POST',
    body: JSON.stringify({
      requestId: `portal_${randomUUID().replaceAll('-', '')}`,
      deviceId,
      capabilityId,
      arguments: {},
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
    const signedAction = mode === 'devices' ? 'devices' : `invoke:${capabilityId}`;
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
      return res.status(401).json({ ok: false, error: auth.reason || 'Companion action proof did not match this request.' });
    }
    if (mode !== 'devices' && mode !== 'invoke') return res.status(400).json({ ok: false, error: 'unsupported mode' });
    if (mode === 'invoke' && !READ_ONLY_COMPANION_CAPABILITIES.has(capabilityId)) {
      return res.status(403).json({ ok: false, error: 'capability is not enabled for remote invocation' });
    }
    const oidcToken = text(config.VERCEL_OIDC_TOKEN);
    if (!oidcToken) return res.status(503).json({ ok: false, error: 'Companion workload identity is unavailable' });

    try {
      const devices = await activeDevices(fetchImpl, oidcToken);
      if (mode === 'devices') return res.status(200).json({ ok: true, devices, capabilities: [...READ_ONLY_COMPANION_CAPABILITIES] });
      const device = chooseDevice(devices, body.deviceId);
      if (!device) {
        return res.status(devices.length === 0 ? 503 : 409).json({
          ok: false,
          error: devices.length === 0 ? 'No Companion device is connected to the direct relay.' : 'Multiple Companion devices are connected; choose a device.',
          devices: devices.map(({ deviceId, expiresAt }) => ({ deviceId, expiresAt })),
        });
      }
      const result = await invoke(fetchImpl, oidcToken, device.deviceId, capabilityId);
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

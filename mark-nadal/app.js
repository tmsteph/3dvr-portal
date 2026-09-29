import { createSignedPortalProof } from '/operator/forge.js';

const HOMESERVER = 'https://gitter.ems.host';
const ROOM_ALIAS = '#amark_gun:gitter.im';
const KNOWN_ROOM_ID = '!apmkrFyPwFRRvQgtEw:gitter.im';
const SECRET_KEY = 'MATRIX_GITTER_TMSTEPH';
const SSO_STATE_KEY = '3dvr.mark.matrix.sso-state';

const ownerStatus = document.getElementById('ownerStatus');
const gunStatus = document.getElementById('gunStatus');
const gunMessage = document.getElementById('gunMessage');
const connectGun = document.getElementById('connectGun');

function setStatus(element, text, state = '') {
  if (!element) return;
  element.textContent = text;
  element.className = `status ${state}`.trim();
}

function signedIn() {
  return globalThis.localStorage?.getItem?.('signedIn') === 'true';
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(String(value || ''));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

let brokerOriginPromise = null;
async function resolveBrokerOrigin() {
  if (brokerOriginPromise) return brokerOriginPromise;
  brokerOriginPromise = (async () => {
    const response = await fetch('/runtime/organism-bridge.json', {
      cache: 'no-store',
      credentials: 'same-origin',
    });
    if (!response.ok) throw new Error('OVH control-plane address is unavailable.');
    const payload = await response.json();
    const parsed = new URL(String(payload?.origin || ''));
    const allowed = parsed.protocol === 'https:'
      && (parsed.hostname === 'portal.3dvr.tech'
        || parsed.hostname === 'control.3dvr.tech'
        || parsed.hostname.endsWith('.trycloudflare.com'));
    if (!allowed) throw new Error('OVH control-plane address is invalid.');
    return parsed.origin;
  })().catch(error => {
    brokerOriginPromise = null;
    throw error;
  });
  return brokerOriginPromise;
}

async function storeMatrixCredential(value) {
  const secretValueHash = await sha256(value);
  const proof = await createSignedPortalProof('secrets-broker-owner', 'store-secret', {
    secretKey: SECRET_KEY,
    secretValueHash,
  });
  if (!proof) throw new Error('Refresh your 3DVR sign-in before connecting GUN chat.');
  const brokerOrigin = await resolveBrokerOrigin();
  const response = await fetch(`${brokerOrigin}/api/secrets-broker`, {
    method: 'POST',
    mode: 'cors',
    credentials: 'omit',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      ...proof,
      action: 'store-secret',
      key: SECRET_KEY,
      value,
      note: 'Gitter Matrix access for the owner-only Mark Nadal / GUN tracker',
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || payload.reason || 'OVH vault did not accept the Matrix connection.');
  }
  return payload;
}

async function matrixJson(path, { method = 'GET', token = '', body } = {}) {
  const response = await fetch(`${HOMESERVER}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || `Matrix returned HTTP ${response.status}.`);
    error.status = response.status;
    error.matrix = payload;
    throw error;
  }
  return payload;
}

function startSso() {
  if (!signedIn()) {
    gunMessage.textContent = 'Sign in to the 3DVR Portal first so the Matrix credential can be stored in your owner vault.';
    return;
  }
  const state = globalThis.crypto.randomUUID();
  sessionStorage.setItem(SSO_STATE_KEY, state);
  const callback = new URL('/mark-nadal/', globalThis.location.origin);
  callback.searchParams.set('matrix', 'callback');
  callback.searchParams.set('state', state);
  const sso = new URL('/_matrix/client/v3/login/sso/redirect', HOMESERVER);
  sso.searchParams.set('redirectUrl', callback.toString());
  globalThis.location.assign(sso.toString());
}

async function completeSso() {
  const url = new URL(globalThis.location.href);
  if (url.searchParams.get('matrix') !== 'callback') return false;

  const loginToken = url.searchParams.get('loginToken') || '';
  const returnedState = url.searchParams.get('state') || '';
  const expectedState = sessionStorage.getItem(SSO_STATE_KEY) || '';

  history.replaceState({}, '', '/mark-nadal/');
  sessionStorage.removeItem(SSO_STATE_KEY);

  if (!loginToken) throw new Error('Gitter returned without a Matrix login token.');
  if (!expectedState || returnedState !== expectedState) {
    throw new Error('Matrix connection state did not match this browser session.');
  }

  setStatus(gunStatus, 'Finishing connection…', 'waiting');
  gunMessage.textContent = 'Exchanging the one-time Gitter login token and joining the public GUN room.';

  const login = await matrixJson('/_matrix/client/v3/login', {
    method: 'POST',
    body: {
      type: 'm.login.token',
      token: loginToken,
      initial_device_display_name: '3DVR Mark Nadal Tracker',
      refresh_token: true,
    },
  });

  const accessToken = String(login.access_token || '');
  if (!accessToken) throw new Error('Matrix login returned no durable access token.');

  const joined = await matrixJson(`/_matrix/client/v3/join/${encodeURIComponent(ROOM_ALIAS)}`, {
    method: 'POST',
    token: accessToken,
    body: {},
  });
  const roomId = String(joined.room_id || '');
  if (!roomId) throw new Error('Gitter did not confirm that this account joined the GUN room.');

  const durable = JSON.stringify({
    provider: 'matrix',
    homeserver: HOMESERVER,
    roomAlias: ROOM_ALIAS,
    roomId,
    userId: String(login.user_id || ''),
    deviceId: String(login.device_id || ''),
    accessToken,
    refreshToken: String(login.refresh_token || ''),
    expiresInMs: Number(login.expires_in_ms) || 0,
    connectedAt: Date.now(),
  });

  await storeMatrixCredential(durable);
  setStatus(gunStatus, 'Connected ✓', 'ready');
  gunMessage.textContent = 'GUN chat is connected. OVH will read new room messages into Private Knowledge on its tracker schedule.';
  return true;
}

connectGun?.addEventListener('click', startSso);

if (signedIn()) setStatus(ownerStatus, '3DVR owner signed in ✓', 'ready');
else setStatus(ownerStatus, '3DVR sign-in required', 'waiting');

completeSso().catch(error => {
  setStatus(gunStatus, 'Connection needs attention', 'waiting');
  gunMessage.textContent = error?.message || 'Matrix connection failed.';
});

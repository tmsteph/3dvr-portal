import { verifySignedSeaPayload, resolveSeaAuthMaxAgeMs } from '../src/auth/sea.js';
import { chooseDeviceProfile, normalizeDeviceHints } from '../src/device/profile.js';

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function resolveSharedCookieDomain(hostname = '') {
  const normalized = normalizeText(hostname).toLowerCase();
  if (!normalized) return '';
  if (normalized === '3dvr.tech' || normalized.endsWith('.3dvr.tech')) {
    return '.3dvr.tech';
  }
  return '';
}

function parseCookieHeader(headerValue = '') {
  return String(headerValue || '')
    .split(';')
    .reduce((acc, entry) => {
      const separator = entry.indexOf('=');
      if (separator === -1) {
        return acc;
      }

      const key = entry.slice(0, separator).trim();
      const value = entry.slice(separator + 1).trim();
      if (key) {
        acc[key] = value;
      }
      return acc;
    }, {});
}

function readCookieObject(req, key) {
  const cookies = parseCookieHeader(req?.headers?.cookie || req?.headers?.Cookie || '');
  const raw = cookies[key];
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(decodeURIComponent(raw));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (_error) {
    return null;
  }
}

function readSessionIdentity(req) {
  const identity = readCookieObject(req, 'portalIdentity');
  if (!identity || identity.signedIn === false) {
    return null;
  }

  return {
    alias: normalizeText(identity.alias),
    username: normalizeText(identity.username),
    signedIn: true,
    updatedAt: Number.isFinite(Number(identity.updatedAt)) ? Math.round(Number(identity.updatedAt)) : Date.now(),
    authMethod: normalizeText(identity.authMethod),
    authProvider: normalizeText(identity.authProvider),
    verifiedEmail: normalizeText(identity.verifiedEmail)
  };
}

function readStoredDevice(req) {
  const device = readCookieObject(req, 'portalDevice');
  if (!device) {
    return null;
  }

  return {
    updatedAt: Number.isFinite(Number(device.updatedAt)) ? Math.round(Number(device.updatedAt)) : null,
    profile: normalizeText(device.profile),
    recommendation: device.recommendation && typeof device.recommendation === 'object' ? device.recommendation : null,
    hints: device.hints && typeof device.hints === 'object' ? normalizeDeviceHints(device.hints) : null,
    identity: device.identity && typeof device.identity === 'object'
      ? {
          alias: normalizeText(device.identity.alias),
          authMethod: normalizeText(device.identity.authMethod),
          authProvider: normalizeText(device.identity.authProvider)
        }
      : null
  };
}

function buildSharedIdentityCookie(identity, hostname = '') {
  const payload = {
    alias: identity.alias,
    username: identity.username || identity.alias.split('@')[0] || 'User',
    signedIn: true,
    updatedAt: Date.now(),
    authMethod: 'sea',
    authProvider: 'gun',
    verifiedEmail: ''
  };

  let cookie = `portalIdentity=${encodeURIComponent(JSON.stringify(payload))}; Path=/; Max-Age=2592000; SameSite=Lax; Secure`;
  const domain = resolveSharedCookieDomain(hostname);
  if (domain) {
    cookie += `; Domain=${domain}`;
  }
  return cookie;
}

function buildDeviceCookie(payload, hostname = '') {
  let cookie = `portalDevice=${encodeURIComponent(JSON.stringify(payload))}; Path=/; Max-Age=2592000; SameSite=Lax; Secure`;
  const domain = resolveSharedCookieDomain(hostname);
  if (domain) {
    cookie += `; Domain=${domain}`;
  }
  return cookie;
}

function getRequestOrigin(req) {
  const forwardedProto = normalizeText(req?.headers?.['x-forwarded-proto'] || req?.headers?.['X-Forwarded-Proto']);
  const forwardedHost = normalizeText(req?.headers?.['x-forwarded-host'] || req?.headers?.['X-Forwarded-Host']);
  const host = forwardedHost || normalizeText(req?.headers?.host || req?.headers?.Host);
  const protocol = forwardedProto || (host.includes('localhost') || host.includes('127.0.0.1') ? 'http' : 'https');
  return host ? `${protocol}://${host}` : '';
}

function resolveDeviceHints(req, body = {}) {
  const source = body?.device && typeof body.device === 'object' ? body.device : {};
  return normalizeDeviceHints({
    userAgent: source.userAgent || req?.headers?.['user-agent'] || req?.headers?.['User-Agent'],
    platform: source.platform || '',
    network: source.network || source.effectiveType || '',
    effectiveType: source.effectiveType || source.network || '',
    downlink: source.downlink,
    rtt: source.rtt,
    cores: source.cores,
    memory: source.memory,
    touch: source.touch,
    saveData: source.saveData,
    screenWidth: source.screenWidth,
    screenHeight: source.screenHeight
  });
}

function resolveSessionAuth(req, body, config) {
  return verifySignedSeaPayload(body, {
    scope: 'portal-session',
    expectedOrigin: normalizeText(body.origin || getRequestOrigin(req) || config.PORTAL_ORIGIN),
    config,
    maxAgeMs: resolveSeaAuthMaxAgeMs(config),
    messages: {
      missing: 'Sign in again to open a portal session.',
      verifyError: 'Refresh your portal sign-in to open a session.',
      invalid: 'Refresh your portal sign-in to open a session.',
      wrongScope: 'Session proof had the wrong scope.',
      wrongPub: 'Session proof did not match this portal account.',
      missingTimestamp: 'Session proof was missing a timestamp.',
      expired: 'Session proof expired. Refresh your sign-in and try again.',
      wrongOrigin: 'Session proof was issued for a different portal origin.'
    }
  });
}

function resolveDeviceAuth(req, body, config) {
  const hasProof = Boolean(body?.authProof && body?.authPub);
  const session = readSessionIdentity(req);

  if (hasProof) {
    const proofResult = verifySignedSeaPayload(body, {
      scope: 'portal-device',
      expectedOrigin: normalizeText(body.origin || getRequestOrigin(req) || config.PORTAL_ORIGIN),
      config,
      maxAgeMs: resolveSeaAuthMaxAgeMs(config),
      messages: {
        missing: 'Sign in again to save device hints.',
        verifyError: 'Refresh your portal sign-in to save device hints.',
        invalid: 'Refresh your portal sign-in to save device hints.',
        wrongScope: 'Device proof had the wrong scope.',
        wrongPub: 'Device proof did not match this portal account.',
        missingTimestamp: 'Device proof was missing a timestamp.',
        expired: 'Device proof expired. Refresh your sign-in and try again.',
        wrongOrigin: 'Device proof was issued for a different portal origin.'
      }
    });
    if (proofResult.ok || !session?.signedIn) {
      return proofResult;
    }
  }

  if (session?.signedIn) {
    return {
      ok: true,
      identity: {
        pub: normalizeText(body?.portalPub || ''),
        alias: session.alias,
        origin: normalizeText(body?.origin || getRequestOrigin(req) || config.PORTAL_ORIGIN),
        action: 'device',
        issuedAt: session.updatedAt,
        scope: 'portal-session'
      }
    };
  }

  return {
    ok: false,
    reason: 'Sign in again to save device hints.'
  };
}

export function createSessionHandler(options = {}) {
  const { config = process.env } = options;

  return async function handler(req, res) {
    setCorsHeaders(res);

    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    if (req.method === 'GET') {
      const identity = readSessionIdentity(req);
      const stored = readStoredDevice(req);
      const device = stored?.hints || resolveDeviceHints(req);
      const recommendation = chooseDeviceProfile(device || {});

      return res.status(200).json({
        ok: true,
        health: true,
        authenticated: Boolean(identity?.signedIn),
        identity: identity || stored?.identity || null,
        origin: getRequestOrigin(req) || null,
        device,
        storedDevice: stored || null,
        recommendation,
        service: '3dvr-portal'
      });
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const body = req.body || {};
    const mode = normalizeText(body.kind || body.mode || body.action || '');
    const isDeviceRequest = mode === 'device' || (mode !== 'session' && Boolean(body.device && typeof body.device === 'object'));
    const auth = isDeviceRequest
      ? await resolveDeviceAuth(req, body, config)
      : await resolveSessionAuth(req, body, config);

    if (!auth.ok) {
      return res.status(401).json({ error: auth.reason });
    }

    if (isDeviceRequest) {
      const device = resolveDeviceHints(req, body);
      const recommendation = chooseDeviceProfile(device || {});
      const payload = {
        updatedAt: Date.now(),
        identity: {
          alias: auth.identity.alias,
          authMethod: 'sea',
          authProvider: 'gun'
        },
        hints: device,
        profile: recommendation.profile,
        recommendation
      };

      res.setHeader('Set-Cookie', buildDeviceCookie(payload, req?.headers?.host || req?.headers?.Host || ''));

      return res.status(200).json({
        ok: true,
        authenticated: true,
        service: '3dvr-portal',
        session: {
          scope: auth.identity.scope || 'portal-device',
          issuedAt: auth.identity.issuedAt,
          origin: auth.identity.origin,
          action: auth.identity.action || normalizeText(body.action) || 'device'
        },
        identity: {
          pub: auth.identity.pub,
          alias: auth.identity.alias,
          origin: auth.identity.origin,
          action: auth.identity.action,
          issuedAt: auth.identity.issuedAt,
          scope: auth.identity.scope
        },
        device,
        recommendation,
        storedDevice: payload
      });
    }

    const device = resolveDeviceHints(req, body);
    const cookie = buildSharedIdentityCookie(auth.identity, req?.headers?.host || req?.headers?.Host || '');
    res.setHeader('Set-Cookie', cookie);

    return res.status(200).json({
      ok: true,
      authenticated: true,
      service: '3dvr-portal',
      session: {
        scope: auth.identity.scope || 'portal-session',
        issuedAt: auth.identity.issuedAt,
        origin: auth.identity.origin,
        action: auth.identity.action || normalizeText(body.action) || 'session'
      },
      identity: {
        pub: auth.identity.pub,
        alias: auth.identity.alias,
        origin: auth.identity.origin,
        action: auth.identity.action,
        issuedAt: auth.identity.issuedAt,
        scope: auth.identity.scope
      },
      device
    });
  };
}

const handler = createSessionHandler();
export default handler;

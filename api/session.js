import { verifySignedSeaPayload, resolveSeaAuthMaxAgeMs } from '../src/auth/sea.js';

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

function readSharedIdentity(req) {
  const cookies = parseCookieHeader(req?.headers?.cookie || req?.headers?.Cookie || '');
  const raw = cookies.portalIdentity;
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(decodeURIComponent(raw));
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    return {
      alias: normalizeText(parsed.alias),
      username: normalizeText(parsed.username),
      signedIn: parsed.signedIn !== false,
      updatedAt: Number.isFinite(Number(parsed.updatedAt)) ? Math.round(Number(parsed.updatedAt)) : Date.now(),
      authMethod: normalizeText(parsed.authMethod),
      authProvider: normalizeText(parsed.authProvider),
      verifiedEmail: normalizeText(parsed.verifiedEmail)
    };
  } catch (_error) {
    return null;
  }
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

function getRequestOrigin(req) {
  const forwardedProto = normalizeText(req?.headers?.['x-forwarded-proto'] || req?.headers?.['X-Forwarded-Proto']);
  const forwardedHost = normalizeText(req?.headers?.['x-forwarded-host'] || req?.headers?.['X-Forwarded-Host']);
  const host = forwardedHost || normalizeText(req?.headers?.host || req?.headers?.Host);
  const protocol = forwardedProto || (host.includes('localhost') || host.includes('127.0.0.1') ? 'http' : 'https');
  return host ? `${protocol}://${host}` : '';
}

function resolveDeviceHints(req, body = {}) {
  const source = body?.device && typeof body.device === 'object' ? body.device : {};
  return {
    userAgent: normalizeText(source.userAgent || req?.headers?.['user-agent'] || req?.headers?.['User-Agent']),
    platform: normalizeText(source.platform || ''),
    cores: Number(source.cores) || null,
    memory: Number(source.memory) || null,
    network: normalizeText(source.network || ''),
    touch: typeof source.touch === 'boolean' ? source.touch : null
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
      const identity = readSharedIdentity(req);
      return res.status(200).json({
        ok: true,
        authenticated: Boolean(identity?.signedIn),
        identity: identity || null,
        origin: getRequestOrigin(req) || null,
        device: resolveDeviceHints(req),
        service: '3dvr-portal'
      });
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const body = req.body || {};
    const auth = await verifySignedSeaPayload(body, {
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

    if (!auth.ok) {
      return res.status(401).json({ error: auth.reason });
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

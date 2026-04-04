const DEFAULT_PORTAL_ORIGIN = 'https://portal.3dvr.tech';

export function normalizeOrigin(value) {
  const candidate = String(value || '').trim();
  if (!candidate) return '';
  try {
    return new URL(candidate).origin;
  } catch (_error) {
    return '';
  }
}

export function normalizeHost(value) {
  const candidate = String(value || '')
    .trim()
    .replace(/^https?:\/\//i, '');
  if (!candidate) return '';
  return candidate.split('/')[0].split(':')[0].toLowerCase();
}

export function inferPortalOriginFromCalendarHost(host, fallbackOrigin = DEFAULT_PORTAL_ORIGIN) {
  const normalizedHost = normalizeHost(host);
  if (!normalizedHost) return fallbackOrigin;

  if (normalizedHost.startsWith('calendar-staging.')) {
    return `https://portal-staging.${normalizedHost.slice('calendar-staging.'.length)}`;
  }

  if (normalizedHost.startsWith('calendar.')) {
    return `https://portal.${normalizedHost.slice('calendar.'.length)}`;
  }

  if (normalizedHost.includes('3dvr-portal-calendar-git-')) {
    return `https://${normalizedHost.replace('3dvr-portal-calendar-git-', '3dvr-portal-git-')}`;
  }

  return fallbackOrigin;
}

export function resolvePortalOrigin(req, env = process.env) {
  const overrideOrigin = normalizeOrigin(env?.PORTAL_ORIGIN);
  if (overrideOrigin) {
    return overrideOrigin;
  }

  const forwardedHost = req?.headers?.['x-forwarded-host'] || req?.headers?.host;
  return inferPortalOriginFromCalendarHost(forwardedHost, DEFAULT_PORTAL_ORIGIN);
}

export function buildProxyTargetUrl(req, portalOrigin) {
  const targetOrigin = normalizeOrigin(portalOrigin) || DEFAULT_PORTAL_ORIGIN;
  const requestPath = String(req?.url || '/api').replace(/^\//, '');
  return new URL(requestPath, `${targetOrigin}/`);
}

export function buildProxyHeaders(req) {
  const incomingHeaders = req?.headers || {};
  const headers = new Headers();
  const forwardedHost = normalizeHost(incomingHeaders['x-forwarded-host'] || incomingHeaders.host || '');
  const forwardedProto = String(incomingHeaders['x-forwarded-proto'] || '').trim() || 'https';

  for (const [key, rawValue] of Object.entries(incomingHeaders)) {
    if (rawValue == null) continue;
    const lowerKey = key.toLowerCase();
    if (['host', 'connection', 'content-length', 'x-forwarded-host', 'x-forwarded-proto'].includes(lowerKey)) {
      continue;
    }
    if (Array.isArray(rawValue)) {
      headers.set(key, lowerKey === 'cookie' ? rawValue.join('; ') : rawValue.join(', '));
      continue;
    }
    headers.set(key, String(rawValue));
  }

  if (forwardedHost) {
    headers.set('x-forwarded-host', forwardedHost);
  }
  headers.set('x-forwarded-proto', forwardedProto);
  return headers;
}

export async function readProxyBody(req) {
  const method = String(req?.method || 'GET').toUpperCase();
  if (['GET', 'HEAD'].includes(method)) {
    return undefined;
  }

  if (Buffer.isBuffer(req?.body)) {
    return req.body;
  }

  if (typeof req?.body === 'string') {
    return req.body;
  }

  if (req?.body && typeof req.body === 'object') {
    const contentType = String(req?.headers?.['content-type'] || '').toLowerCase();
    if (contentType.includes('application/x-www-form-urlencoded')) {
      return new URLSearchParams(req.body).toString();
    }
    return JSON.stringify(req.body);
  }

  if (!req || typeof req.on !== 'function') {
    return undefined;
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  if (!chunks.length) {
    return undefined;
  }
  return Buffer.concat(chunks);
}

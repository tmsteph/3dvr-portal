(function initAuthIdentity(global) {
  const SHARED_COOKIE_NAME = 'portalIdentity';
  const SHARED_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

  function normalizeText(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function aliasToDisplay(alias) {
    const normalized = normalizeText(alias);
    if (!normalized) return '';
    return normalized.includes('@') ? normalized.split('@')[0] : normalized;
  }

  function resolveSharedCookieDomain(hostname = '') {
    const normalized = normalizeText(hostname).toLowerCase();
    if (!normalized) return '';
    if (normalized === '3dvr.tech' || normalized.endsWith('.3dvr.tech')) {
      return '.3dvr.tech';
    }
    return '';
  }

  function sanitizeIdentityPayload(payload = {}) {
    const alias = normalizeText(payload.alias);
    if (!alias) {
      return null;
    }
    const username = normalizeText(payload.username);
    const signedIn = payload.signedIn !== false;
    const timestamp = Number(payload.updatedAt);
    const updatedAt = Number.isFinite(timestamp) ? Math.round(timestamp) : Date.now();
    return {
      alias,
      username,
      signedIn,
      updatedAt
    };
  }

  function readSharedIdentity({ documentObj = global.document } = {}) {
    if (!documentObj || typeof documentObj.cookie !== 'string') {
      return null;
    }
    const entries = documentObj.cookie.split(';');
    for (let index = 0; index < entries.length; index += 1) {
      const pair = entries[index];
      const separator = pair.indexOf('=');
      if (separator === -1) continue;
      const key = pair.slice(0, separator).trim();
      if (key !== SHARED_COOKIE_NAME) continue;
      const rawValue = pair.slice(separator + 1);
      try {
        const decoded = decodeURIComponent(rawValue);
        const parsed = JSON.parse(decoded);
        return sanitizeIdentityPayload(parsed);
      } catch (_err) {
        return null;
      }
    }
    return null;
  }

  function writeSharedIdentity(
    payload = {},
    { documentObj = global.document, locationObj = global.location } = {}
  ) {
    if (!documentObj) {
      return false;
    }
    const identity = sanitizeIdentityPayload(payload);
    if (!identity || !identity.signedIn) {
      return false;
    }

    const encodedValue = encodeURIComponent(JSON.stringify(identity));
    let cookie = `${SHARED_COOKIE_NAME}=${encodedValue}; Path=/; Max-Age=${SHARED_COOKIE_MAX_AGE}; SameSite=Lax; Secure`;
    const domain = resolveSharedCookieDomain(locationObj && locationObj.hostname);
    if (domain) {
      cookie += `; Domain=${domain}`;
    }
    documentObj.cookie = cookie;
    return true;
  }

  function clearSharedIdentity({ documentObj = global.document, locationObj = global.location } = {}) {
    if (!documentObj) {
      return false;
    }
    const hostname = locationObj && locationObj.hostname;
    const domain = resolveSharedCookieDomain(hostname);
    const base = `${SHARED_COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax; Secure`;
    documentObj.cookie = base;
    if (domain) {
      documentObj.cookie = `${base}; Domain=${domain}`;
    }
    return true;
  }

  function syncStorageFromSharedIdentity(storage = global.localStorage) {
    if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') {
      return false;
    }
    const identity = readSharedIdentity();
    if (!identity || !identity.signedIn) {
      return false;
    }

    const nextAlias = identity.alias;
    const nextUsername = identity.username || aliasToDisplay(nextAlias) || 'User';
    const currentSignedIn = storage.getItem('signedIn') === 'true';
    const currentAlias = normalizeText(storage.getItem('alias'));
    const currentUsername = normalizeText(storage.getItem('username'));
    const needsWrite = !currentSignedIn || currentAlias !== nextAlias || currentUsername !== nextUsername;

    if (!needsWrite) {
      return false;
    }

    storage.setItem('signedIn', 'true');
    storage.setItem('alias', nextAlias);
    storage.setItem('username', nextUsername);
    storage.removeItem('guest');
    storage.removeItem('guestId');
    storage.removeItem('guestDisplayName');
    return true;
  }

  global.AuthIdentity = {
    SHARED_COOKIE_NAME,
    readSharedIdentity,
    writeSharedIdentity,
    clearSharedIdentity,
    syncStorageFromSharedIdentity,
    resolveSharedCookieDomain,
  };
})(typeof window !== 'undefined' ? window : globalThis);

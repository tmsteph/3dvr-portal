(function initAuthIdentity(global) {
  const SHARED_COOKIE_NAME = 'portalIdentity';
  const SHARED_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;
  const AUTH_CACHE_RECOVERY_VERSION = '2026-06-30-auth-cache-v1';
  const AUTH_CACHE_RECOVERY_KEY = '3dvr-auth-cache-recovery-version';
  const AUTH_CACHE_RECOVERY_RELOAD_KEY = `3dvr-auth-cache-recovery-reload:${AUTH_CACHE_RECOVERY_VERSION}`;
  const AUTH_CRITICAL_PATHS = new Set(['/', '/index.html', '/profile.html', '/sign-in.html']);

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

  function isAuthCriticalPath(locationObj = global.location) {
    const pathname = locationObj && typeof locationObj.pathname === 'string'
      ? locationObj.pathname
      : '';
    return AUTH_CRITICAL_PATHS.has(pathname || '/');
  }

  function shouldRunAuthCacheRecovery(storage = global.localStorage) {
    try {
      return !storage || storage.getItem(AUTH_CACHE_RECOVERY_KEY) !== AUTH_CACHE_RECOVERY_VERSION;
    } catch (_err) {
      return true;
    }
  }

  function markAuthCacheRecovery(storage = global.localStorage) {
    if (!storage || typeof storage.setItem !== 'function') return;
    try {
      storage.setItem(AUTH_CACHE_RECOVERY_KEY, AUTH_CACHE_RECOVERY_VERSION);
    } catch (_err) {
      // Ignore storage failures; cache recovery is best-effort.
    }
  }

  function clearPortalShellCaches(cacheApi = global.caches) {
    if (!cacheApi || typeof cacheApi.keys !== 'function' || typeof cacheApi.delete !== 'function') {
      return Promise.resolve(false);
    }

    return cacheApi.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => /^3dvr-(html|static)-/.test(String(key || '')))
          .map(key => cacheApi.delete(key))
      ))
      .then(results => results.some(Boolean));
  }

  function requestWaitingActivation(registration) {
    if (!registration || !registration.waiting || typeof registration.waiting.postMessage !== 'function') {
      return false;
    }
    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    return true;
  }

  function updateRootServiceWorker(navigatorObj = global.navigator) {
    if (
      !navigatorObj
      || !navigatorObj.serviceWorker
      || typeof navigatorObj.serviceWorker.getRegistration !== 'function'
    ) {
      return Promise.resolve(false);
    }

    return navigatorObj.serviceWorker.getRegistration('/')
      .then(registration => {
        if (!registration) return false;
        const updatePromise = typeof registration.update === 'function'
          ? registration.update().catch(() => registration)
          : Promise.resolve(registration);
        return updatePromise.then(nextRegistration => {
          requestWaitingActivation(nextRegistration || registration);
          return true;
        });
      });
  }

  function reloadAuthCriticalPageOnce({
    locationObj = global.location,
    sessionStorageObj = global.sessionStorage,
  } = {}) {
    if (!isAuthCriticalPath(locationObj) || !locationObj || typeof locationObj.reload !== 'function') {
      return false;
    }

    try {
      if (
        sessionStorageObj
        && typeof sessionStorageObj.getItem === 'function'
        && sessionStorageObj.getItem(AUTH_CACHE_RECOVERY_RELOAD_KEY) === 'true'
      ) {
        return false;
      }
      if (sessionStorageObj && typeof sessionStorageObj.setItem === 'function') {
        sessionStorageObj.setItem(AUTH_CACHE_RECOVERY_RELOAD_KEY, 'true');
      }
    } catch (_err) {
      // Reload anyway if sessionStorage is unavailable.
    }

    locationObj.reload();
    return true;
  }

  function refreshPortalAuthCache({
    storage = global.localStorage,
    reload = false,
  } = {}) {
    if (!shouldRunAuthCacheRecovery(storage)) {
      return Promise.resolve(false);
    }

    return Promise.all([
      clearPortalShellCaches(),
      updateRootServiceWorker(),
    ])
      .then(results => {
        markAuthCacheRecovery(storage);
        if (reload) {
          reloadAuthCriticalPageOnce();
        }
        return results.some(Boolean);
      })
      .catch(() => false);
  }

  function sanitizeIdentityPayload(payload = {}) {
    const alias = normalizeText(payload.alias);
    if (!alias) {
      return null;
    }
    const username = normalizeText(payload.username);
    const signedIn = payload.signedIn !== false;
    const authMethod = normalizeText(payload.authMethod);
    const authProvider = normalizeText(payload.authProvider);
    const verifiedEmail = normalizeText(payload.verifiedEmail).toLowerCase();
    const timestamp = Number(payload.updatedAt);
    const updatedAt = Number.isFinite(timestamp) ? Math.round(timestamp) : Date.now();
    return {
      alias,
      username,
      signedIn,
      updatedAt,
      authMethod,
      authProvider,
      verifiedEmail
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
    const nextVerifiedEmail = normalizeText(identity.verifiedEmail).toLowerCase();
    const hasStoredPassword = normalizeText(storage.getItem('password')).length > 0;
    const nextSignedIn = hasStoredPassword || identity.authMethod === 'oauth' || identity.authMethod === 'sea';
    const currentSignedIn = storage.getItem('signedIn') === 'true';
    const currentAlias = normalizeText(storage.getItem('alias'));
    const currentUsername = normalizeText(storage.getItem('username'));
    const currentAuthMethod = normalizeText(storage.getItem('authMethod'));
    const currentAuthProvider = normalizeText(storage.getItem('authProvider'));
    const currentVerifiedEmail = normalizeText(storage.getItem('verifiedEmail')).toLowerCase();
    const hasGuestMarkers = Boolean(
      storage.getItem('guest')
      || storage.getItem('guestId')
      || storage.getItem('guestDisplayName')
    );
    const needsWrite = (
      currentSignedIn !== nextSignedIn
      || currentAlias !== nextAlias
      || currentUsername !== nextUsername
      || currentAuthMethod !== identity.authMethod
      || currentAuthProvider !== identity.authProvider
      || currentVerifiedEmail !== nextVerifiedEmail
      || hasGuestMarkers
    );

    if (!needsWrite) {
      return false;
    }

    if (nextSignedIn) {
      storage.setItem('signedIn', 'true');
    } else {
      storage.removeItem('signedIn');
    }
    storage.setItem('alias', nextAlias);
    storage.setItem('username', nextUsername);
    if (identity.authMethod) {
      storage.setItem('authMethod', identity.authMethod);
    } else {
      storage.removeItem('authMethod');
    }
    if (identity.authProvider) {
      storage.setItem('authProvider', identity.authProvider);
    } else {
      storage.removeItem('authProvider');
    }
    if (identity.verifiedEmail) {
      storage.setItem('verifiedEmail', identity.verifiedEmail);
    } else {
      storage.removeItem('verifiedEmail');
    }
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
    refreshPortalAuthCache,
    resolveSharedCookieDomain,
  };

  refreshPortalAuthCache({ reload: true });
})(typeof window !== 'undefined' ? window : globalThis);

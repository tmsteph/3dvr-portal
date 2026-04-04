(function initPortalOAuth(global) {
  const RESULT_KEY = 'portal.oauth.result';
  const CONNECTIONS_KEY = 'portal.oauth.connections';

  function normalizeText(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function normalizeEmail(value) {
    return normalizeText(value).toLowerCase();
  }

  function safeParse(value, fallback) {
    try {
      return JSON.parse(value);
    } catch (_err) {
      return fallback;
    }
  }

  function readJsonStorage(key, fallback) {
    try {
      const raw = global.localStorage && typeof global.localStorage.getItem === 'function'
        ? global.localStorage.getItem(key)
        : '';
      return raw ? safeParse(raw, fallback) : fallback;
    } catch (_err) {
      return fallback;
    }
  }

  function writeJsonStorage(key, value) {
    try {
      if (!global.localStorage || typeof global.localStorage.setItem !== 'function') {
        return false;
      }
      global.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (_err) {
      return false;
    }
  }

  function removeStorageItem(key) {
    try {
      global.localStorage && global.localStorage.removeItem && global.localStorage.removeItem(key);
    } catch (_err) {}
  }

  function readPendingResult() {
    return readJsonStorage(RESULT_KEY, null);
  }

  function consumePendingResult() {
    const result = readPendingResult();
    removeStorageItem(RESULT_KEY);
    return result;
  }

  function readConnections() {
    return readJsonStorage(CONNECTIONS_KEY, {}) || {};
  }

  function writeConnections(value) {
    return writeJsonStorage(CONNECTIONS_KEY, value || {});
  }

  function getConnection(provider) {
    const normalizedProvider = normalizeText(provider).toLowerCase();
    const connections = readConnections();
    return connections[normalizedProvider] || null;
  }

  function setConnection(provider, record) {
    const normalizedProvider = normalizeText(provider).toLowerCase();
    if (!normalizedProvider || !record || typeof record !== 'object') {
      return null;
    }
    const connections = readConnections();
    connections[normalizedProvider] = {
      ...(connections[normalizedProvider] || {}),
      ...record,
      provider: normalizedProvider,
      updatedAt: Date.now(),
    };
    writeConnections(connections);
    return connections[normalizedProvider];
  }

  function clearConnection(provider) {
    const normalizedProvider = normalizeText(provider).toLowerCase();
    const connections = readConnections();
    delete connections[normalizedProvider];
    writeConnections(connections);
  }

  function connectionFromResult(result) {
    if (!result || !result.ok || !result.connection || typeof result.connection !== 'object') {
      return null;
    }
    return {
      ...result.connection,
      provider: normalizeText(result.provider).toLowerCase(),
      email: normalizeEmail(result.connection.email || result.identity?.email),
      displayName: normalizeText(result.connection.displayName || result.identity?.displayName),
      source: 'oauth',
    };
  }

  function storeConnectionFromResult(result) {
    const connection = connectionFromResult(result);
    if (!connection || !connection.provider) {
      return null;
    }
    return setConnection(connection.provider, connection);
  }

  function sanitizeReturnTo(value) {
    const candidate = normalizeText(value);
    if (!candidate) {
      const search = global.location && typeof global.location.search === 'string' ? global.location.search : '';
      const hash = global.location && typeof global.location.hash === 'string' ? global.location.hash : '';
      return `${global.location && global.location.pathname ? global.location.pathname : '/'}${search}${hash}`;
    }
    if (candidate.startsWith('/') && !candidate.startsWith('//')) {
      return candidate;
    }
    try {
      const parsed = new URL(candidate, global.location && global.location.origin ? global.location.origin : 'https://portal.3dvr.tech');
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    } catch (_err) {
      return global.location && global.location.pathname ? global.location.pathname : '/';
    }
  }

  function buildStartUrl(provider, options) {
    const normalizedProvider = normalizeText(provider).toLowerCase();
    const query = new URLSearchParams({
      action: 'start',
      intent: normalizeText(options && options.intent) || 'signin',
      scopeKey: normalizeText(options && options.scopeKey) || 'identity',
      returnTo: sanitizeReturnTo(options && options.returnTo),
    });
    const aliasHint = normalizeEmail(options && options.aliasHint);
    if (aliasHint) {
      query.set('aliasHint', aliasHint);
    }
    return `/api/oauth/${encodeURIComponent(normalizedProvider)}?${query.toString()}`;
  }

  function begin(provider, options) {
    const url = buildStartUrl(provider, options || {});
    global.location.href = url;
  }

  async function fetchProviderConfig(provider) {
    const normalizedProvider = normalizeText(provider).toLowerCase();
    const response = await global.fetch(`/api/oauth/${encodeURIComponent(normalizedProvider)}?action=config`);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || `Unable to load ${normalizedProvider} OAuth config.`);
    }
    return payload;
  }

  async function listContacts(provider, options) {
    const normalizedProvider = normalizeText(provider).toLowerCase();
    const accessToken = normalizeText(options && options.accessToken);
    if (!accessToken) {
      throw new Error('Access token is required.');
    }
    const response = await global.fetch(`/api/oauth/${encodeURIComponent(normalizedProvider)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'listContacts',
        accessToken,
        limit: options && options.limit,
        pageToken: options && options.pageToken,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || `Unable to load ${normalizedProvider} contacts.`);
    }
    return payload;
  }

  function writeAuthSession(payload) {
    const alias = normalizeEmail(payload && payload.alias);
    const username = normalizeText(payload && payload.username) || (alias.includes('@') ? alias.split('@')[0] : alias) || 'User';
    if (!alias) {
      return false;
    }
    try {
      global.localStorage.setItem('signedIn', 'true');
      global.localStorage.setItem('alias', alias);
      global.localStorage.setItem('username', username);
      global.localStorage.setItem('authMethod', 'oauth');
      global.localStorage.setItem('authProvider', normalizeText(payload && payload.provider).toLowerCase());
      global.localStorage.setItem('oauthAccountId', normalizeText(payload && payload.providerAccountId));
      if (payload && payload.verifiedEmail) {
        global.localStorage.setItem('verifiedEmail', normalizeEmail(payload.verifiedEmail));
      }
      global.localStorage.removeItem('password');
      global.localStorage.removeItem('guest');
      global.localStorage.removeItem('guestId');
      global.localStorage.removeItem('guestDisplayName');
    } catch (_err) {
      return false;
    }
    try {
      if (global.AuthIdentity && typeof global.AuthIdentity.writeSharedIdentity === 'function') {
        global.AuthIdentity.writeSharedIdentity({
          signedIn: true,
          alias,
          username,
          authMethod: 'oauth',
          authProvider: normalizeText(payload && payload.provider).toLowerCase(),
          verifiedEmail: normalizeEmail(payload && payload.verifiedEmail),
        });
      }
    } catch (_err) {}
    return true;
  }

  function clearAuthSessionMarkers() {
    removeStorageItem('authMethod');
    removeStorageItem('authProvider');
    removeStorageItem('oauthAccountId');
    removeStorageItem('verifiedEmail');
  }

  global.PortalOAuth = {
    RESULT_KEY,
    CONNECTIONS_KEY,
    begin,
    buildStartUrl,
    clearAuthSessionMarkers,
    clearConnection,
    connectionFromResult,
    consumePendingResult,
    fetchProviderConfig,
    getConnection,
    listContacts,
    readConnections,
    readPendingResult,
    setConnection,
    storeConnectionFromResult,
    writeAuthSession,
  };
})(typeof window !== 'undefined' ? window : globalThis);

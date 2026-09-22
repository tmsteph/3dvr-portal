const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  getGoogleAccessToken,
  loadGoogleAccountCredential,
  registerGoogleAccount,
} = require('../../connectors/google/oauth');

const DEFAULT_PORTAL_URL = 'https://portal.3dvr.tech';
const TOKEN_REFRESH_SKEW_MS = 5 * 60 * 1000;

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeEmail(value) {
  const email = normalizeText(value).toLowerCase();
  if (!email) return '';
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

function normalizeProvider(value) {
  const provider = normalizeText(value).toLowerCase();
  if (provider === 'gmail') return 'google';
  if (provider === 'outlook' || provider === 'office365' || provider === 'm365') return 'microsoft';
  return provider || 'google';
}

function defaultGoogleAlias() {
  return normalizeText(process.env.THREEDVR_GOOGLE_ACCOUNT || '3dvr').toLowerCase() || '3dvr';
}

function googleAliasFromEmail(value) {
  const email = normalizeEmail(value);
  if (email === 'tmsteph1290@gmail.com') return 'tmsteph';
  if (email === '3dvr.tech@gmail.com') return '3dvr';
  const local = email.split('@')[0] || '';
  return local.replace(/[^a-z0-9._-]/gi, '-').toLowerCase() || defaultGoogleAlias();
}

function oauthFilePath() {
  return process.env.THREEDVR_OAUTH_FILE || path.join(os.homedir(), '.3dvr', 'oauth.json');
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function readJsonFile(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJsonFile(filePath, value) {
  ensureDir(filePath);
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  try {
    fs.chmodSync(filePath, 0o600);
  } catch {
    // Android/Termux filesystems may ignore chmod.
  }
}

function loadStore() {
  const parsed = readJsonFile(oauthFilePath(), {});
  return {
    version: 1,
    connections: parsed && typeof parsed.connections === 'object' ? parsed.connections : {},
    updatedAt: normalizeText(parsed?.updatedAt),
  };
}

function saveStore(store) {
  writeJsonFile(oauthFilePath(), {
    version: 1,
    connections: store.connections || {},
    updatedAt: new Date().toISOString(),
  });
}

function normalizeConnection(connection = {}) {
  const provider = normalizeProvider(connection.provider);
  return {
    provider,
    email: normalizeEmail(connection.email),
    displayName: normalizeText(connection.displayName),
    accessToken: normalizeText(connection.accessToken || connection.access_token),
    refreshToken: normalizeText(connection.refreshToken || connection.refresh_token),
    scope: normalizeText(connection.scope),
    scopeKey: normalizeText(connection.scopeKey || connection.scope_key || 'mail').toLowerCase() || 'mail',
    expiresAt: Math.max(0, Number(connection.expiresAt || connection.expires_at) || 0),
    linkedAt: Math.max(0, Number(connection.linkedAt || connection.linked_at) || Date.now()),
    updatedAt: Date.now(),
    source: normalizeText(connection.source || 'oauth'),
    accountAlias: normalizeText(connection.accountAlias || connection.account_alias).toLowerCase(),
  };
}

function loadSecureGoogleConnection(alias = defaultGoogleAlias()) {
  try {
    const { account, credential } = loadGoogleAccountCredential(alias);
    return normalizeConnection({
      ...credential,
      provider: 'google',
      email: account.email,
      accountAlias: account.alias,
      source: 'oauth-vault',
    });
  } catch (_err) {
    return null;
  }
}

function loadOAuthConnection(provider = 'google', options = {}) {
  const normalizedProvider = normalizeProvider(provider);
  if (normalizedProvider === 'google') {
    const secure = loadSecureGoogleConnection(options.alias || defaultGoogleAlias());
    if (secure) return secure;
  }
  const store = loadStore();
  const connection = store.connections[normalizedProvider];
  return connection ? normalizeConnection(connection) : null;
}

function saveOAuthConnection(connection, options = {}) {
  const normalized = normalizeConnection(connection);
  if (!normalized.provider) {
    throw new Error('OAuth provider is required.');
  }
  if (!normalized.refreshToken) {
    throw new Error('OAuth refresh token is required.');
  }
  if (normalized.provider === 'google') {
    const alias = normalizeText(options.alias || normalized.accountAlias || googleAliasFromEmail(normalized.email)).toLowerCase();
    const account = registerGoogleAccount({
      ...normalized,
      alias,
      scopes: normalizeText(normalized.scope).split(/\s+/).filter(Boolean),
    });
    return normalizeConnection({
      ...normalized,
      email: account.email,
      accountAlias: account.alias,
      source: 'oauth-vault',
    });
  }
  const store = loadStore();
  store.connections[normalized.provider] = normalized;
  saveStore(store);
  return normalized;
}

function removeOAuthConnection(provider = 'google') {
  const store = loadStore();
  const normalizedProvider = normalizeProvider(provider);
  delete store.connections[normalizedProvider];
  saveStore(store);
}

function refreshEndpoint(provider) {
  const explicit = normalizeText(process.env.THREEDVR_OAUTH_REFRESH_ENDPOINT);
  if (explicit) return explicit;
  const portalUrl = normalizeText(process.env.THREEDVR_PORTAL_URL) || DEFAULT_PORTAL_URL;
  return `${portalUrl.replace(/\/+$/, '')}/api/oauth/${encodeURIComponent(provider)}`;
}

async function refreshOAuthAccessToken(connection, { fetchImpl = fetch } = {}) {
  const current = normalizeConnection(connection);
  if (current.provider === 'google' && current.accountAlias) {
    await getGoogleAccessToken(current.accountAlias, { fetchImpl });
    const refreshed = loadSecureGoogleConnection(current.accountAlias);
    if (refreshed) return refreshed;
  }
  if (!current.refreshToken) {
    throw new Error(`No ${current.provider} OAuth refresh token is saved. Run 3dvr auth login ${current.provider}.`);
  }

  const response = await fetchImpl(refreshEndpoint(current.provider), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      action: 'refresh',
      refreshToken: current.refreshToken,
      scopeKey: current.scopeKey || 'mail',
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || `Unable to refresh ${current.provider} OAuth token: ${response.status}`);
  }

  return saveOAuthConnection({
    ...current,
    accessToken: payload.accessToken,
    refreshToken: payload.refreshToken || current.refreshToken,
    scope: payload.scope || current.scope,
    scopeKey: payload.scopeKey || current.scopeKey,
    expiresAt: payload.expiresAt || 0,
    updatedAt: Date.now(),
    source: payload.source || 'oauth-refresh',
  });
}

async function getOAuthAccessToken(provider = 'google', options = {}) {
  const normalizedProvider = normalizeProvider(provider);
  const alias = normalizedProvider === 'google' ? (options.alias || defaultGoogleAlias()) : '';
  if (normalizedProvider === 'google') {
    const secure = loadSecureGoogleConnection(alias);
    if (secure) {
      const resolved = await getGoogleAccessToken(alias, options);
      return normalizeConnection({
        ...secure,
        accessToken: resolved.accessToken,
        email: resolved.account.email,
        accountAlias: resolved.account.alias,
        source: 'oauth-vault',
      });
    }
  }
  const connection = loadOAuthConnection(normalizedProvider, { alias });
  if (!connection) {
    throw new Error(`No ${normalizedProvider} OAuth connection is saved. Run 3dvr auth login ${normalizedProvider}.`);
  }
  if (connection.accessToken && (!connection.expiresAt || connection.expiresAt > Date.now() + TOKEN_REFRESH_SKEW_MS)) {
    return connection;
  }
  return refreshOAuthAccessToken(connection, options);
}

function extractConnection(input, options = {}) {
  const parsed = typeof input === 'string' ? JSON.parse(input) : input;
  const connection = parsed?.connection || parsed;
  if (!connection || typeof connection !== 'object') {
    throw new Error('OAuth import must be a JSON object from the portal callback.');
  }
  return saveOAuthConnection({
    ...connection,
    email: connection.email || parsed?.identity?.email,
    displayName: connection.displayName || parsed?.identity?.displayName,
  }, options);
}

function connectionStatus(provider = 'google', options = {}) {
  const connection = loadOAuthConnection(provider, options);
  if (!connection) {
    return {
      provider: normalizeProvider(provider),
      configured: false,
      file: oauthFilePath(),
    };
  }
  return {
    provider: connection.provider,
    configured: true,
    accountAlias: connection.accountAlias || '',
    email: connection.email || '',
    displayName: connection.displayName || '',
    scopeKey: connection.scopeKey || '',
    expiresAt: connection.expiresAt ? new Date(connection.expiresAt).toISOString() : '',
    needsRefresh: !connection.accessToken || (connection.expiresAt && connection.expiresAt <= Date.now() + TOKEN_REFRESH_SKEW_MS),
    file: oauthFilePath(),
  };
}

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function printStatus(status) {
  const legacyUser = normalizeEmail(process.env.GMAIL_USER) || '3dvr.tech@gmail.com';
  const legacyPass = normalizeText(process.env.GMAIL_APP_PASSWORD);
  const outreachPhone = normalizeText(process.env.THREEDVR_OUTREACH_PHONE);
  console.log(`${status.provider} email connection`);
  console.log('----------------------------------------');
  if (!status.configured) {
    console.log('Status: not connected');
    console.log(`Connection file: ${status.file}`);
    console.log(`Legacy Gmail app password: ${legacyPass ? `configured for ${legacyUser}` : 'not configured'}`);
    console.log(`Outbound phone: ${outreachPhone ? 'configured' : 'not configured'}`);
    console.log('');
    console.log('Next step:');
    console.log(`  3dvr auth login ${status.provider}`);
    console.log('');
    console.log('After browser approval, run:');
    console.log('  3dvr auth import');
    return;
  }

  console.log('Status: connected');
  if (status.accountAlias) console.log(`Account: ${status.accountAlias}`);
  if (status.email) console.log(`Email: ${status.email}`);
  if (status.displayName) console.log(`Name: ${status.displayName}`);
  if (status.scopeKey) console.log(`Scope: ${status.scopeKey}`);
  if (status.expiresAt) console.log(`Access token expires: ${status.expiresAt}`);
  console.log(`Needs refresh: ${status.needsRefresh ? 'yes' : 'no'}`);
  console.log(`Connection file: ${status.file}`);
  console.log(`Legacy Gmail app password: ${legacyPass ? `configured for ${legacyUser}` : 'not configured'}`);
  console.log(`Outbound phone: ${outreachPhone ? 'configured' : 'not configured'}`);
  console.log('');
  console.log('Tokens are stored locally and are not printed here.');
}

function parseAuthTarget(value = 'google') {
  const target = normalizeText(value).toLowerCase();
  if (target === 'tmsteph' || target === '3dvr') {
    return { provider: 'google', alias: target };
  }
  const provider = normalizeProvider(target || 'google');
  return {
    provider,
    alias: provider === 'google' ? defaultGoogleAlias() : '',
  };
}

async function cli(argv) {
  const command = normalizeText(argv[2] || 'status').toLowerCase();

  if (command === 'status') {
    const target = parseAuthTarget(argv[3] || 'google');
    printStatus(connectionStatus(target.provider, { alias: target.alias }));
    return;
  }

  if (command === 'import') {
    const possibleAlias = normalizeText(argv[3]).toLowerCase();
    const hasAlias = possibleAlias === 'tmsteph' || possibleAlias === '3dvr';
    const filePath = normalizeText(hasAlias ? argv[4] : argv[3]);
    const raw = filePath ? fs.readFileSync(filePath, 'utf8') : readStdin();
    const saved = extractConnection(raw, { alias: hasAlias ? possibleAlias : '' });
    console.log(`Imported ${saved.provider} connection${saved.accountAlias ? ` as ${saved.accountAlias}` : ''}${saved.email ? ` for ${saved.email}` : ''}.`);
    console.log('');
    console.log('Next step:');
    console.log(`  3dvr auth status ${saved.accountAlias || saved.provider}`);
    console.log('  3dvr inbox check');
    console.log('');
    console.log('OAuth credentials are stored in the encrypted connector vault.');
    return;
  }

  if (command === 'refresh') {
    const target = parseAuthTarget(argv[3] || 'google');
    const current = loadOAuthConnection(target.provider, { alias: target.alias }) || {
      provider: target.provider,
      accountAlias: target.alias,
    };
    const refreshed = await refreshOAuthAccessToken(current);
    console.log(`Refreshed ${refreshed.provider} access${refreshed.accountAlias ? ` for ${refreshed.accountAlias}` : ''}${refreshed.email ? ` (${refreshed.email})` : ''}.`);
    console.log('Access token updated securely. Token value was not printed.');
    return;
  }

  if (command === 'logout' || command === 'remove') {
    const target = parseAuthTarget(argv[3] || 'google');
    removeOAuthConnection(target.provider);
    console.log(`Removed legacy ${target.provider} connection state.`);
    console.log('Encrypted multi-account credentials are intentionally left intact.');
    return;
  }

  console.error('Usage: 3dvr auth status [tmsteph|3dvr|google|microsoft] | import [tmsteph|3dvr] [file] | refresh [tmsteph|3dvr|google|microsoft]');
  process.exit(1);
}

module.exports = {
  normalizeText,
  normalizeEmail,
  normalizeProvider,
  loadOAuthConnection,
  saveOAuthConnection,
  removeOAuthConnection,
  refreshOAuthAccessToken,
  getOAuthAccessToken,
  extractConnection,
  connectionStatus,
};

if (require.main === module) {
  cli(process.argv).catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}

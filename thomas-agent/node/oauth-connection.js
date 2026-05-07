const fs = require('fs');
const os = require('os');
const path = require('path');

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
  };
}

function loadOAuthConnection(provider = 'google') {
  const store = loadStore();
  const normalizedProvider = normalizeProvider(provider);
  const connection = store.connections[normalizedProvider];
  return connection ? normalizeConnection(connection) : null;
}

function saveOAuthConnection(connection) {
  const normalized = normalizeConnection(connection);
  if (!normalized.provider) {
    throw new Error('OAuth provider is required.');
  }
  if (!normalized.refreshToken) {
    throw new Error('OAuth refresh token is required.');
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
  const connection = loadOAuthConnection(provider);
  if (!connection) {
    throw new Error(`No ${normalizeProvider(provider)} OAuth connection is saved. Run 3dvr auth login ${normalizeProvider(provider)}.`);
  }
  if (connection.accessToken && (!connection.expiresAt || connection.expiresAt > Date.now() + TOKEN_REFRESH_SKEW_MS)) {
    return connection;
  }
  return refreshOAuthAccessToken(connection, options);
}

function extractConnection(input) {
  const parsed = typeof input === 'string' ? JSON.parse(input) : input;
  const connection = parsed?.connection || parsed;
  if (!connection || typeof connection !== 'object') {
    throw new Error('OAuth import must be a JSON object from the portal callback.');
  }
  return saveOAuthConnection(connection);
}

function connectionStatus(provider = 'google') {
  const connection = loadOAuthConnection(provider);
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
  console.log(`${status.provider} email connection`);
  console.log('----------------------------------------');
  if (!status.configured) {
    console.log('Status: not connected');
    console.log(`Connection file: ${status.file}`);
    console.log(`Legacy Gmail app password: ${legacyPass ? `configured for ${legacyUser}` : 'not configured'}`);
    console.log('');
    console.log('Next step:');
    console.log(`  3dvr auth login ${status.provider}`);
    console.log('');
    console.log('After browser approval, run:');
    console.log('  3dvr auth import');
    return;
  }

  console.log('Status: connected');
  if (status.email) console.log(`Email: ${status.email}`);
  if (status.displayName) console.log(`Name: ${status.displayName}`);
  if (status.scopeKey) console.log(`Scope: ${status.scopeKey}`);
  if (status.expiresAt) console.log(`Access token expires: ${status.expiresAt}`);
  console.log(`Needs refresh: ${status.needsRefresh ? 'yes' : 'no'}`);
  console.log(`Connection file: ${status.file}`);
  console.log(`Legacy Gmail app password: ${legacyPass ? `configured for ${legacyUser}` : 'not configured'}`);
  console.log('');
  console.log('Tokens are stored locally and are not printed here.');
}

async function cli(argv) {
  const command = normalizeText(argv[2] || 'status').toLowerCase();
  const provider = normalizeProvider(argv[3] || 'google');

  if (command === 'status') {
    printStatus(connectionStatus(provider));
    return;
  }

  if (command === 'import') {
    const filePath = normalizeText(argv[3]);
    const raw = filePath ? fs.readFileSync(filePath, 'utf8') : readStdin();
    const saved = extractConnection(raw);
    console.log(`Imported ${saved.provider} email connection${saved.email ? ` for ${saved.email}` : ''}.`);
    console.log('');
    console.log('Next step:');
    console.log('  3dvr email status');
    console.log('  3dvr inbox check');
    console.log('');
    console.log('OAuth is used automatically when no Gmail app password is configured.');
    return;
  }

  if (command === 'refresh') {
    const refreshed = await refreshOAuthAccessToken(loadOAuthConnection(provider) || { provider });
    console.log(`Refreshed ${refreshed.provider} email access${refreshed.email ? ` for ${refreshed.email}` : ''}.`);
    console.log('Access token updated locally. Token value was not printed.');
    return;
  }

  if (command === 'logout' || command === 'remove') {
    removeOAuthConnection(provider);
    console.log(`Removed ${provider} email connection.`);
    console.log(`Run \`3dvr auth login ${provider}\` to connect it again.`);
    return;
  }

  console.error('Usage: 3dvr auth status|import [file]|refresh [provider]|logout [provider]');
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

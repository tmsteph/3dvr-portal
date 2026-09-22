const {
  getAccount,
  upsertAccount,
} = require('../accounts/registry');
const {
  loadGoogleCredential,
  saveGoogleCredential,
} = require('./oauth-vault');
const { OpenBaoBackend } = require('../secrets/openbao');

const GOOGLE_BOOTSTRAP_SECRETS = Object.freeze({
  '3dvr': { key: 'GOOGLE_OAUTH_3DVR', email: '3dvr.tech@gmail.com' },
  'tmsteph': { key: 'GOOGLE_OAUTH_TMSTEPH', email: 'tmsteph1290@gmail.com' },
});

const DEFAULT_PORTAL_URL = 'https://portal.3dvr.tech';
const TOKEN_REFRESH_SKEW_MS = 5 * 60 * 1000;

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeEmail(value) {
  return normalizeText(value).toLowerCase();
}

function resolveOpenBao(options = {}) {
  const backend = options.openBaoBackend || new OpenBaoBackend();
  try {
    return backend.ready() ? backend : null;
  } catch {
    return null;
  }
}

function refreshEndpoint() {
  const explicit = normalizeText(process.env.THREEDVR_OAUTH_REFRESH_ENDPOINT);
  if (explicit) return explicit;
  const portalUrl = normalizeText(process.env.THREEDVR_PORTAL_URL) || DEFAULT_PORTAL_URL;
  return `${portalUrl.replace(/\/+$/, '')}/api/oauth/google`;
}

function registerGoogleAccount(input, options = {}) {
  const pending = upsertAccount({
    id: input?.id,
    provider: 'google',
    alias: input?.alias,
    email: input?.email,
    scopes: input?.scopes,
    status: 'pending_credentials',
  }, { filePath: options.registryFilePath });

  const credentialRef = saveGoogleCredential(pending.id, input, {
    filePath: options.vaultFilePath,
    keyMaterial: options.keyMaterial,
    openBaoBackend: options.openBaoBackend,
  });

  return upsertAccount({
    ...pending,
    status: 'connected',
    credentialRef,
  }, { filePath: options.registryFilePath });
}

function bootstrapGoogleAccount(identifier, options = {}) {
  const alias = normalizeText(identifier).toLowerCase();
  const expected = GOOGLE_BOOTSTRAP_SECRETS[alias];
  if (!expected) return null;
  const openbao = resolveOpenBao(options);
  if (!openbao) return null;

  try {
    const payload = JSON.parse(openbao.get({ key: expected.key }));
    const email = normalizeEmail(payload.email);
    if (email !== expected.email) {
      throw new Error(`Google bootstrap identity mismatch for ${alias}`);
    }
    return registerGoogleAccount({
      ...payload,
      alias,
      email,
      scopes: normalizeText(payload.scope).split(/\s+/).filter(Boolean),
    }, options);
  } catch (error) {
    if (options.strictBootstrap) throw error;
    return null;
  }
}

function resolveGoogleAccount(identifier, options = {}) {
  let account = null;
  let lookupError = null;
  try {
    account = getAccount(identifier, {
      provider: 'google',
      filePath: options.registryFilePath,
    });
  } catch (error) {
    lookupError = error;
  }

  if (!account || !account.credentialRef) {
    const bootstrapped = bootstrapGoogleAccount(identifier, options);
    if (bootstrapped) account = bootstrapped;
  }

  if (!account) {
    throw lookupError || new Error(`Google connector account not found: ${identifier}`);
  }
  if (!account.credentialRef) {
    throw new Error(`Google account has no credential reference: ${account.id}`);
  }
  return account;
}

function loadGoogleAccountCredential(identifier, options = {}) {
  const account = resolveGoogleAccount(identifier, options);
  const credential = loadGoogleCredential(account.credentialRef, {
    filePath: options.vaultFilePath,
    keyMaterial: options.keyMaterial,
    openBaoBackend: options.openBaoBackend,
  });
  return { account, credential };
}

async function refreshGoogleCredential(account, credential, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const response = await fetchImpl(refreshEndpoint(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      action: 'refresh',
      refreshToken: credential.refreshToken,
      scopeKey: credential.scopeKey || 'mail',
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || `Unable to refresh Google OAuth token: ${response.status}`);
  }

  const updated = {
    ...credential,
    accessToken: payload.accessToken,
    refreshToken: payload.refreshToken || credential.refreshToken,
    scope: payload.scope || credential.scope,
    scopeKey: payload.scopeKey || credential.scopeKey,
    expiresAt: payload.expiresAt || 0,
  };
  saveGoogleCredential(account.id, updated, {
    filePath: options.vaultFilePath,
    keyMaterial: options.keyMaterial,
    openBaoBackend: options.openBaoBackend,
  });
  return updated;
}

async function getGoogleAccessToken(identifier, options = {}) {
  const { account, credential } = loadGoogleAccountCredential(identifier, options);
  const now = Number(options.now || Date.now());
  let current = credential;
  if (!current.accessToken || (current.expiresAt && current.expiresAt <= now + TOKEN_REFRESH_SKEW_MS)) {
    current = await refreshGoogleCredential(account, current, options);
  }
  if (!current.accessToken) {
    throw new Error(`Google OAuth access token unavailable for ${account.alias}.`);
  }
  return {
    account,
    accessToken: current.accessToken,
  };
}

module.exports = {
  bootstrapGoogleAccount,
  getGoogleAccessToken,
  loadGoogleAccountCredential,
  refreshGoogleCredential,
  registerGoogleAccount,
  resolveGoogleAccount,
};

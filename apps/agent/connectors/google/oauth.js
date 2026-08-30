const {
  getAccount,
  upsertAccount,
} = require('../accounts/registry');
const {
  loadGoogleCredential,
  saveGoogleCredential,
} = require('./oauth-vault');

const DEFAULT_PORTAL_URL = 'https://portal.3dvr.tech';
const TOKEN_REFRESH_SKEW_MS = 5 * 60 * 1000;

function normalizeText(value) {
  return String(value || '').trim();
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
  });

  return upsertAccount({
    ...pending,
    status: 'connected',
    credentialRef,
  }, { filePath: options.registryFilePath });
}

function resolveGoogleAccount(identifier, options = {}) {
  const account = getAccount(identifier, {
    provider: 'google',
    filePath: options.registryFilePath,
  });
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
  getGoogleAccessToken,
  loadGoogleAccountCredential,
  refreshGoogleCredential,
  registerGoogleAccount,
  resolveGoogleAccount,
};

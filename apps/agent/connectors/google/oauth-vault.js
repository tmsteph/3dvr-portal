const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

function normalizeText(value) {
  return String(value || '').trim();
}

function defaultVaultPath() {
  return process.env.THREEDVR_CONNECTOR_GOOGLE_VAULT_FILE
    || path.join(os.homedir(), '.3dvr', 'connectors', 'google-oauth.enc.json');
}

function masterKeyMaterial(explicit) {
  const value = normalizeText(explicit || process.env.THREEDVR_CONNECTOR_MASTER_KEY);
  if (!value) {
    throw new Error('THREEDVR_CONNECTOR_MASTER_KEY is required for connector credential storage.');
  }
  return value;
}

function deriveKey(keyMaterial) {
  return crypto.createHash('sha256').update(masterKeyMaterial(keyMaterial), 'utf8').digest();
}

function readStore(filePath = defaultVaultPath()) {
  try {
    if (!fs.existsSync(filePath)) return { version: 1, secrets: {} };
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return {
      version: 1,
      secrets: parsed && typeof parsed.secrets === 'object' ? parsed.secrets : {},
    };
  } catch {
    return { version: 1, secrets: {} };
  }
}

function writeStore(store, filePath = defaultVaultPath()) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify({
    version: 1,
    secrets: store.secrets || {},
    updatedAt: new Date().toISOString(),
  }, null, 2)}\n`, { mode: 0o600 });
  try {
    fs.chmodSync(filePath, 0o600);
  } catch {
    // Some Android/Termux filesystems ignore chmod.
  }
}

function credentialRef(accountId) {
  const id = normalizeText(accountId);
  if (!/^acct_google_[a-z0-9]+$/i.test(id)) {
    throw new Error('A valid Google connector account id is required.');
  }
  return `google-oauth:${id}`;
}

function encrypt(value, ref, keyMaterial) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(keyMaterial), iv);
  cipher.setAAD(Buffer.from(ref, 'utf8'));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(value), 'utf8'),
    cipher.final(),
  ]);
  return {
    algorithm: 'aes-256-gcm',
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  };
}

function decrypt(record, ref, keyMaterial) {
  if (!record || record.algorithm !== 'aes-256-gcm') {
    throw new Error(`Unsupported or missing credential record: ${ref}`);
  }
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    deriveKey(keyMaterial),
    Buffer.from(record.iv, 'base64'),
  );
  decipher.setAAD(Buffer.from(ref, 'utf8'));
  decipher.setAuthTag(Buffer.from(record.tag, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(record.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
  return JSON.parse(plaintext);
}

function normalizeCredential(input = {}) {
  const refreshToken = normalizeText(input.refreshToken || input.refresh_token);
  if (!refreshToken) throw new Error('Google OAuth refresh token is required.');
  return {
    accessToken: normalizeText(input.accessToken || input.access_token),
    refreshToken,
    scope: normalizeText(input.scope),
    scopeKey: normalizeText(input.scopeKey || input.scope_key || 'mail').toLowerCase() || 'mail',
    expiresAt: Math.max(0, Number(input.expiresAt || input.expires_at) || 0),
    updatedAt: Date.now(),
  };
}

function saveGoogleCredential(accountId, input, { filePath, keyMaterial } = {}) {
  const ref = credentialRef(accountId);
  const credential = normalizeCredential(input);
  const store = readStore(filePath);
  store.secrets[ref] = {
    ...encrypt(credential, ref, keyMaterial),
    updatedAt: new Date().toISOString(),
  };
  writeStore(store, filePath);
  return ref;
}

function loadGoogleCredential(refOrAccountId, { filePath, keyMaterial } = {}) {
  const ref = normalizeText(refOrAccountId).startsWith('google-oauth:')
    ? normalizeText(refOrAccountId)
    : credentialRef(refOrAccountId);
  const store = readStore(filePath);
  const record = store.secrets[ref];
  if (!record) throw new Error(`Google OAuth credential not found: ${ref}`);
  return normalizeCredential(decrypt(record, ref, keyMaterial));
}

function removeGoogleCredential(refOrAccountId, { filePath } = {}) {
  const ref = normalizeText(refOrAccountId).startsWith('google-oauth:')
    ? normalizeText(refOrAccountId)
    : credentialRef(refOrAccountId);
  const store = readStore(filePath);
  delete store.secrets[ref];
  writeStore(store, filePath);
}

module.exports = {
  credentialRef,
  defaultVaultPath,
  loadGoogleCredential,
  removeGoogleCredential,
  saveGoogleCredential,
};

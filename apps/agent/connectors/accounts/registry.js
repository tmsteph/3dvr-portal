const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeProvider(value) {
  const provider = normalizeText(value).toLowerCase();
  if (provider === 'gmail') return 'google';
  return provider;
}

function normalizeAlias(value) {
  const alias = normalizeText(value).toLowerCase();
  if (!alias) throw new Error('Account alias is required.');
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(alias)) {
    throw new Error('Account alias may contain letters, numbers, dots, underscores, and hyphens.');
  }
  return alias;
}

function normalizeEmail(value) {
  const email = normalizeText(value).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('A valid account email is required.');
  }
  return email;
}

function defaultRegistryPath() {
  return process.env.THREEDVR_CONNECTOR_ACCOUNTS_FILE
    || path.join(os.homedir(), '.3dvr', 'connectors', 'accounts.json');
}

function readStore(filePath = defaultRegistryPath()) {
  try {
    if (!fs.existsSync(filePath)) return { version: 1, accounts: {} };
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return {
      version: 1,
      accounts: parsed && typeof parsed.accounts === 'object' ? parsed.accounts : {},
    };
  } catch {
    return { version: 1, accounts: {} };
  }
}

function writeStore(store, filePath = defaultRegistryPath()) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const payload = {
    version: 1,
    accounts: store.accounts || {},
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
  try {
    fs.chmodSync(filePath, 0o600);
  } catch {
    // Some Android/Termux filesystems ignore chmod.
  }
}

function makeAccountId(provider) {
  const suffix = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  return `acct_${normalizeProvider(provider)}_${suffix}`;
}

function normalizeScopes(scopes) {
  return [...new Set((Array.isArray(scopes) ? scopes : [])
    .map((scope) => normalizeText(scope))
    .filter(Boolean))].sort();
}

function sanitizeAccount(account) {
  if (!account) return null;
  return {
    id: account.id,
    provider: account.provider,
    alias: account.alias,
    email: account.email,
    scopes: [...(account.scopes || [])],
    status: account.status || 'connected',
    credentialRef: account.credentialRef || '',
    createdAt: account.createdAt || '',
    updatedAt: account.updatedAt || '',
  };
}

function listAccounts({ provider, filePath } = {}) {
  const store = readStore(filePath);
  const normalizedProvider = provider ? normalizeProvider(provider) : '';
  return Object.values(store.accounts)
    .filter((account) => !normalizedProvider || account.provider === normalizedProvider)
    .map(sanitizeAccount)
    .sort((a, b) => a.alias.localeCompare(b.alias));
}

function getAccount(identifier, { provider, filePath } = {}) {
  const wanted = normalizeText(identifier).toLowerCase();
  if (!wanted) throw new Error('Account id or alias is required.');
  const normalizedProvider = provider ? normalizeProvider(provider) : '';
  const account = listAccounts({ provider: normalizedProvider, filePath }).find((candidate) => (
    candidate.id.toLowerCase() === wanted || candidate.alias === wanted
  ));
  if (!account) throw new Error(`Connector account not found: ${identifier}`);
  return account;
}

function upsertAccount(input, { filePath } = {}) {
  const provider = normalizeProvider(input?.provider || 'google');
  const alias = normalizeAlias(input?.alias);
  const email = normalizeEmail(input?.email);
  const store = readStore(filePath);
  const existing = Object.values(store.accounts).find((account) => (
    account.id === input?.id
    || (account.provider === provider && account.email === email)
    || (account.provider === provider && account.alias === alias)
  ));

  for (const account of Object.values(store.accounts)) {
    if (existing && account.id === existing.id) continue;
    if (account.provider === provider && account.alias === alias) {
      throw new Error(`Account alias already exists for ${provider}: ${alias}`);
    }
    if (account.provider === provider && account.email === email) {
      throw new Error(`Account email already exists for ${provider}: ${email}`);
    }
  }

  const now = new Date().toISOString();
  const account = {
    id: existing?.id || input?.id || makeAccountId(provider),
    provider,
    alias,
    email,
    scopes: normalizeScopes(input?.scopes ?? existing?.scopes),
    status: normalizeText(input?.status || existing?.status || 'connected').toLowerCase(),
    credentialRef: normalizeText(input?.credentialRef ?? existing?.credentialRef),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
  store.accounts[account.id] = account;
  writeStore(store, filePath);
  return sanitizeAccount(account);
}

module.exports = {
  defaultRegistryPath,
  getAccount,
  listAccounts,
  makeAccountId,
  normalizeAlias,
  normalizeEmail,
  normalizeProvider,
  upsertAccount,
};

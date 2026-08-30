const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');

const {
  getAccount,
  listAccounts,
  upsertAccount,
} = require('../connectors/accounts/registry');
const {
  loadGoogleCredential,
  saveGoogleCredential,
} = require('../connectors/google/oauth-vault');
const {
  getGoogleAccessToken,
  registerGoogleAccount,
} = require('../connectors/google/oauth');
const {
  buildRawMessage,
  createDraft,
  searchMessages,
} = require('../connectors/google/gmail');

function fixturePaths() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), '3dvr-connectors-'));
  return {
    root,
    registryFilePath: path.join(root, 'accounts.json'),
    vaultFilePath: path.join(root, 'google.enc.json'),
    keyMaterial: 'test-only-master-key',
  };
}

function futureExpiry() {
  return Date.now() + (60 * 60 * 1000);
}

test('account registry keeps two Google identities distinct and addressable by alias', () => {
  const options = fixturePaths();
  const personal = upsertAccount({
    provider: 'google',
    alias: 'personal',
    email: 'person@example.com',
    scopes: ['gmail.readonly'],
    credentialRef: 'google-oauth:test-personal',
  }, options);
  const work = upsertAccount({
    provider: 'google',
    alias: 'work',
    email: 'work@example.com',
    scopes: ['gmail.compose', 'gmail.readonly'],
    credentialRef: 'google-oauth:test-work',
  }, options);

  assert.notEqual(personal.id, work.id);
  assert.deepEqual(listAccounts({ provider: 'google', filePath: options.registryFilePath }).map((account) => account.alias), [
    'personal',
    'work',
  ]);
  assert.equal(getAccount('work', { provider: 'google', filePath: options.registryFilePath }).email, 'work@example.com');
});

test('Google OAuth vault encrypts refresh tokens at rest', () => {
  const options = fixturePaths();
  const account = upsertAccount({
    provider: 'google',
    alias: 'personal',
    email: 'person@example.com',
  }, options);
  const secret = 'refresh-token-that-must-not-be-plaintext';
  const ref = saveGoogleCredential(account.id, {
    refreshToken: secret,
    accessToken: 'access-token',
    expiresAt: futureExpiry(),
  }, options);

  const rawVault = fs.readFileSync(options.vaultFilePath, 'utf8');
  assert.equal(rawVault.includes(secret), false);
  assert.equal(loadGoogleCredential(ref, options).refreshToken, secret);
});

test('registered Google accounts resolve separate access tokens', async () => {
  const options = fixturePaths();
  const personal = registerGoogleAccount({
    alias: 'personal',
    email: 'person@example.com',
    scopes: ['gmail.readonly'],
    refreshToken: 'personal-refresh',
    accessToken: 'personal-access',
    expiresAt: futureExpiry(),
  }, options);
  const work = registerGoogleAccount({
    alias: 'work',
    email: 'work@example.com',
    scopes: ['gmail.readonly'],
    refreshToken: 'work-refresh',
    accessToken: 'work-access',
    expiresAt: futureExpiry(),
  }, options);

  const personalAuth = await getGoogleAccessToken(personal.id, options);
  const workAuth = await getGoogleAccessToken('work', options);

  assert.equal(personalAuth.accessToken, 'personal-access');
  assert.equal(workAuth.accessToken, 'work-access');
  assert.equal(workAuth.account.id, work.id);
});

test('Gmail search requires an explicit account and uses its token', async () => {
  const calls = [];
  const tokenResolver = async (accountId) => {
    calls.push(['token', accountId]);
    return {
      account: { id: accountId, alias: accountId, email: `${accountId}@example.com` },
      accessToken: `token-${accountId}`,
    };
  };
  const fetchImpl = async (url, request) => {
    calls.push(['fetch', url, request.headers.Authorization]);
    return {
      ok: true,
      json: async () => ({ messages: [{ id: 'm1' }], resultSizeEstimate: 1 }),
    };
  };

  await assert.rejects(() => searchMessages({ query: 'from:test' }, { tokenResolver, fetchImpl }), /accountId is required/);
  const result = await searchMessages({ accountId: 'work', query: 'from:test', maxResults: 5 }, { tokenResolver, fetchImpl });

  assert.equal(result.messages[0].id, 'm1');
  assert.deepEqual(calls[0], ['token', 'work']);
  assert.match(calls[1][1], /messages\?q=from%3Atest&maxResults=5/);
  assert.equal(calls[1][2], 'Bearer token-work');
});

test('Gmail draft is prepared in the selected mailbox without sending', async () => {
  let captured;
  const tokenResolver = async (accountId) => ({
    account: { id: accountId, alias: 'work', email: 'work@example.com' },
    accessToken: 'work-access',
  });
  const fetchImpl = async (url, request) => {
    captured = { url, request };
    return {
      ok: true,
      json: async () => ({ id: 'draft-1', message: { id: 'message-1' } }),
    };
  };

  const result = await createDraft({
    accountId: 'work',
    to: 'customer@example.com',
    subject: 'Hello',
    body: 'Prepared, not sent.',
  }, { tokenResolver, fetchImpl });

  assert.equal(captured.url, 'https://gmail.googleapis.com/gmail/v1/users/me/drafts');
  assert.equal(captured.request.method, 'POST');
  assert.equal(captured.request.headers.Authorization, 'Bearer work-access');
  assert.equal(result.draft.id, 'draft-1');

  const raw = JSON.parse(captured.request.body).message.raw;
  const decoded = Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
  assert.match(decoded, /From: work@example.com/);
  assert.match(decoded, /To: customer@example.com/);
  assert.match(decoded, /Prepared, not sent\./);
});

test('raw message builder rejects header injection', () => {
  assert.throws(() => buildRawMessage({
    from: 'work@example.com',
    to: 'customer@example.com\r\nBcc: attacker@example.com',
    subject: 'Hello',
    body: 'Nope',
  }), /invalid newline/);
});

'use strict';

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { BrokerBackend, aliasForKey } = require('../connectors/secrets/broker');
const { resolveSecretsBackend } = require('../connectors/secrets/backend');
const { upsertAccount } = require('../connectors/accounts/registry');
const { provisionAgent } = require('../thomas-agent/node/secrets-broker');

function tempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function fixtureRegistry(dir) {
  const filePath = path.join(dir, 'accounts.json');
  const account = upsertAccount({
    id: 'acct_google_0123456789abcdef',
    provider: 'google',
    alias: '3dvr',
    email: '3dvr.tech@gmail.com',
    status: 'connected',
    credentialRef: 'google-oauth:acct_google_0123456789abcdef',
  }, { filePath });
  assert.equal(account.alias, '3dvr');
  return filePath;
}

test('aliasForKey maps bootstrap payloads and vault refs to broker aliases', () => {
  const dir = tempDir('3dvr-broker-alias-');
  const accountsFile = fixtureRegistry(dir);
  assert.equal(aliasForKey('GOOGLE_OAUTH_3DVR', { accountsFile }), 'google.oauth.3dvr');
  assert.equal(aliasForKey('GOOGLE_OAUTH_TMSTEPH', { accountsFile }), 'google.oauth.tmsteph');
  assert.equal(
    aliasForKey('google-oauth:acct_google_0123456789abcdef', { accountsFile }),
    'google.vault.3dvr',
  );
  assert.throws(() => aliasForKey('google-oauth:acct_google_ffffffffffffffff', { accountsFile }), /alias unavailable/);
  assert.throws(() => aliasForKey('SOME_OTHER_SECRET', { accountsFile }), /no alias mapping/);
});

test('BrokerBackend ready requires a socket and a readable agent token', () => {
  const dir = tempDir('3dvr-broker-ready-');
  const socketPath = path.join(dir, 'broker.sock');
  const tokenFile = path.join(dir, 'agent.token');
  assert.equal(new BrokerBackend({ socketPath, tokenFile }).ready(), false);
  fs.writeFileSync(socketPath, '');
  assert.equal(new BrokerBackend({ socketPath, tokenFile }).ready(), false);
  fs.writeFileSync(tokenFile, 'fixture-token\n', { mode: 0o600 });
  assert.equal(new BrokerBackend({ socketPath, tokenFile }).ready(), true);
  assert.equal(new BrokerBackend({ socketPath, token: 'fixture-token' }).ready(), true);
});

test('BrokerBackend get resolves the value through the worker with a mapped alias', () => {
  const dir = tempDir('3dvr-broker-get-');
  const socketPath = path.join(dir, 'broker.sock');
  fs.writeFileSync(socketPath, '');
  let invocation;
  const backend = new BrokerBackend({ socketPath, token: 'fixture-token' }, {
    run(file, args, options) {
      invocation = { file, args, input: JSON.parse(options.input) };
      return { status: 0, stdout: JSON.stringify({ ok: true, value: 'fixture-payload' }), stderr: '' };
    },
  });

  assert.equal(backend.get({ key: 'GOOGLE_OAUTH_3DVR' }), 'fixture-payload');
  assert.deepEqual(invocation.args.slice(-1), ['--worker']);
  assert.equal(invocation.input.operation, 'get');
  assert.equal(invocation.input.alias, 'google.oauth.3dvr');
  assert.equal(invocation.input.config.scope, 'secrets:google-oauth');
  assert.equal(JSON.stringify(invocation.input).includes('fixture-payload'), false);
});

test('BrokerBackend create stores through the mapped vault alias with the connector key', () => {
  const dir = tempDir('3dvr-broker-put-');
  const socketPath = path.join(dir, 'broker.sock');
  fs.writeFileSync(socketPath, '');
  const accountsFile = fixtureRegistry(dir);
  let invocation;
  const backend = new BrokerBackend({ socketPath, token: 'fixture-token', accountsFile }, {
    run(_file, _args, options) {
      invocation = JSON.parse(options.input);
      return { status: 0, stdout: JSON.stringify({ ok: true }), stderr: '' };
    },
  });

  const created = backend.create({ key: 'google-oauth:acct_google_0123456789abcdef', value: 'fixture-credential' });
  assert.equal(created.backend, 'broker');
  assert.equal(invocation.operation, 'put');
  assert.equal(invocation.alias, 'google.vault.3dvr');
  assert.equal(invocation.key, 'google-oauth:acct_google_0123456789abcdef');
  assert.equal(invocation.data.value, 'fixture-credential');
});

test('BrokerBackend surfaces worker failures as errors', () => {
  const dir = tempDir('3dvr-broker-err-');
  const socketPath = path.join(dir, 'broker.sock');
  fs.writeFileSync(socketPath, '');
  const backend = new BrokerBackend({ socketPath, token: 'fixture-token' }, {
    run() {
      return { status: 1, stdout: '', stderr: JSON.stringify({ error: 'Secrets broker request denied (agent-scope-not-granted)' }) };
    },
  });
  assert.throws(() => backend.get({ key: 'GOOGLE_OAUTH_3DVR' }), /agent-scope-not-granted/);
});

test('resolveSecretsBackend falls back to the broker when AppRole files are absent', () => {
  const dir = tempDir('3dvr-broker-resolve-');
  const socketPath = path.join(dir, 'broker.sock');
  fs.writeFileSync(socketPath, '');
  const backend = resolveSecretsBackend(null, {
    openBaoConfig: {
      roleIdFile: path.join(dir, 'missing-role-id'),
      secretIdFile: path.join(dir, 'missing-secret-id'),
    },
    brokerConfig: { socketPath, token: 'fixture-token' },
  });
  assert.ok(backend instanceof BrokerBackend);

  const missing = resolveSecretsBackend(null, {
    openBaoConfig: {
      roleIdFile: path.join(dir, 'missing-role-id'),
      secretIdFile: path.join(dir, 'missing-secret-id'),
    },
    brokerConfig: { socketPath: path.join(dir, 'missing.sock'), token: 'fixture-token' },
  });
  assert.equal(missing, null);
});

test('BrokerBackend reads a bootstrap payload through the real broker policy core', async () => {
  const dir = tempDir('3dvr-broker-e2e-');
  const socketPath = path.join(dir, 'broker.sock');
  const policyFile = path.join(dir, 'policy.json');
  const agentsFile = path.join(dir, 'agents.json');
  const approvalsFile = path.join(dir, 'approvals.json');
  const tokenFile = path.join(dir, 'operator.token');
  const accountsFile = fixtureRegistry(dir);
  const kvFile = path.join(dir, 'kv.json');

  const payload = JSON.stringify({ email: '3dvr.tech@gmail.com', refreshToken: 'fixture-refresh', scope: 'mail' });
  const vault = JSON.stringify({ refreshToken: 'fixture-vault-refresh', scopeKey: 'mail' });
  fs.writeFileSync(kvFile, `${JSON.stringify({
    GOOGLE_OAUTH_3DVR: payload,
    'google-oauth:acct_google_0123456789abcdef': vault,
  }, null, 2)}\n`);
  fs.writeFileSync(policyFile, `${JSON.stringify({
    version: 1,
    defaults: { approval: 'always', leaseSeconds: 300, maxUses: 1 },
    backends: { openbao: { type: 'openbao-kv' } },
    secrets: {
      'google.oauth.3dvr': {
        backend: 'openbao',
        locator: { key: 'GOOGLE_OAUTH_3DVR' },
        capability: 'secret.read',
        scopes: ['secrets:google-oauth'],
        approval: { mode: 'auto' },
      },
      'google.vault.3dvr': {
        backend: 'openbao',
        locator: { key: 'google-oauth:acct_google_0123456789abcdef' },
        capability: 'secret.read',
        scopes: ['secrets:google-oauth'],
        approval: { mode: 'auto' },
        write: {
          capability: 'secret.write',
          scopes: ['secrets:google-oauth'],
          approval: { mode: 'auto' },
          projectName: 'google-oauth-vault',
        },
      },
    },
  }, null, 2)}\n`);
  provisionAgent({
    agentsFile,
    agentId: 'ovh-operator',
    tokenFile,
    capabilities: ['secret.read', 'secret.write'],
    scopes: ['secrets:google-oauth'],
  });

  // The broker server must run in its own process: BrokerBackend is
  // synchronous (spawnSync worker), so an in-process server would deadlock.
  const brokerModule = path.join(__dirname, '..', 'thomas-agent', 'node', 'secrets-broker.js');
  const serverFile = path.join(dir, 'broker-server-fixture.js');
  fs.writeFileSync(serverFile, `'use strict';
const fs = require('node:fs');
const http = require('node:http');
const { SecretsBroker } = require(${JSON.stringify(brokerModule)});
const config = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const broker = new SecretsBroker({
  policyFile: config.policyFile,
  agentsFile: config.agentsFile,
  approvalsFile: config.approvalsFile,
  auditFile: config.auditFile,
  auditKeyFile: config.auditKeyFile,
  backends: {
    openbao: {
      ready: () => true,
      get(locator) {
        const kv = JSON.parse(fs.readFileSync(config.kvFile, 'utf8'));
        const value = kv[locator.key];
        if (typeof value !== 'string') throw new Error('OpenBao secret value is missing');
        return value;
      },
      create({ key, value }) {
        const kv = JSON.parse(fs.readFileSync(config.kvFile, 'utf8'));
        kv[key] = value;
        fs.writeFileSync(config.kvFile, JSON.stringify(kv, null, 2) + '\\n');
        return { id: '', key, backend: 'openbao' };
      },
    },
  },
});
const server = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  const presented = String(req.headers.authorization || '').replace(/^Bearer\\s+/i, '');
  const agent = broker.authenticate(presented);
  const result = req.url === '/v1/store' ? broker.store(agent, body) : broker.request(agent, body);
  res.statusCode = result.status;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(result.body));
});
server.listen(config.socketPath, () => process.stdout.write('READY\\n'));
`);
  const serverConfigFile = path.join(dir, 'server.json');
  fs.writeFileSync(serverConfigFile, `${JSON.stringify({
    socketPath,
    policyFile,
    agentsFile,
    approvalsFile,
    auditFile: path.join(dir, 'audit.jsonl'),
    auditKeyFile: path.join(dir, 'audit.key'),
    kvFile,
  }, null, 2)}\n`);
  const child = spawn(process.execPath, [serverFile, serverConfigFile], { stdio: ['ignore', 'pipe', 'pipe'] });
  let serverStderr = '';
  child.stderr.on('data', (chunk) => { serverStderr += chunk; });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`broker fixture did not start: ${serverStderr}`)), 15000);
      child.stdout.on('data', (chunk) => {
        if (String(chunk).includes('READY')) {
          clearTimeout(timer);
          resolve();
        }
      });
      child.on('exit', (code) => {
        clearTimeout(timer);
        reject(new Error(`broker fixture exited early (${code}): ${serverStderr}`));
      });
    });

    const backend = new BrokerBackend({ socketPath, tokenFile, accountsFile });
    assert.equal(backend.ready(), true);
    assert.equal(backend.get({ key: 'GOOGLE_OAUTH_3DVR' }), payload);
    assert.equal(backend.get({ key: 'google-oauth:acct_google_0123456789abcdef' }), vault);

    backend.create({ key: 'google-oauth:acct_google_0123456789abcdef', value: 'rotated-fixture' });
    const kvAfter = JSON.parse(fs.readFileSync(kvFile, 'utf8'));
    assert.equal(kvAfter['google-oauth:acct_google_0123456789abcdef'], 'rotated-fixture');

    const denied = new BrokerBackend({ socketPath, tokenFile, accountsFile, scope: 'secrets:not-granted' });
    assert.throws(() => denied.get({ key: 'GOOGLE_OAUTH_3DVR' }), /denied/);
  } finally {
    child.kill('SIGTERM');
  }
});

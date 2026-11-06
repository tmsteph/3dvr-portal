'use strict';

// BrokerBackend is a secrets backend with the same synchronous shape as
// OpenBaoBackend (ready/get/create, work delegated to a `--worker`
// subprocess) that reads and writes OpenBao KV entries through the local
// secrets broker (apps/agent/thomas-agent/node/secrets-broker-server.js)
// instead of reading the OpenBao AppRole files directly.
//
// Runtimes that cannot read /etc/3dvr/openbao (owned by the
// threedvr-secrets group) authenticate to the broker with their own agent
// token. The broker enforces per-alias policy, capability and scope
// checks and writes an audit record for every release, so no filesystem
// access to the AppRole credentials is required.
//
// The broker addresses secrets by policy alias; the alias's policy entry
// holds the actual OpenBao locator. This backend maps the Google
// connector's OpenBao keys to aliases:
//   GOOGLE_OAUTH_<ALIAS>           -> google.oauth.<alias>
//   google-oauth:acct_google_<id>  -> google.vault.<account alias>
// The account alias is resolved from the connector accounts registry.

const fs = require('fs');
const http = require('http');
const { spawnSync } = require('child_process');
const { getAccount, defaultRegistryPath } = require('../accounts/registry');

const DEFAULTS = Object.freeze({
  socketPath: '/run/3dvr-secrets-broker/broker.sock',
  scope: 'secrets:google-oauth',
  purpose: 'google-oauth-connector',
  timeoutMs: 30000,
});

function text(value, max = 1000) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

function normalizeConfig(config = {}, env = process.env) {
  const socketPath = text(config.socketPath || env.THREEDVR_SECRETS_BROKER_SOCKET || DEFAULTS.socketPath, 1000);
  const tokenFile = text(config.tokenFile || env.THREEDVR_SECRETS_BROKER_TOKEN_FILE, 1000);
  const token = text(config.token || env.THREEDVR_SECRETS_BROKER_TOKEN, 10000);
  const scope = text(config.scope || env.THREEDVR_SECRETS_BROKER_SCOPE || DEFAULTS.scope, 300);
  const purpose = text(config.purpose || DEFAULTS.purpose, 500);
  const accountsFile = text(config.accountsFile || env.THREEDVR_CONNECTOR_ACCOUNTS_FILE || defaultRegistryPath(), 1000);
  const timeoutMs = Math.max(1000, Math.min(Number(config.timeoutMs || DEFAULTS.timeoutMs), 120000));
  return { socketPath, tokenFile, token, scope, purpose, accountsFile, timeoutMs };
}

function aliasForKey(key, config = {}) {
  const id = text(key, 500);
  const bootstrap = id.match(/^GOOGLE_OAUTH_([A-Z0-9]+)$/);
  if (bootstrap) return `google.oauth.${bootstrap[1].toLowerCase()}`;
  const vault = id.match(/^google-oauth:(acct_google_[a-z0-9]+)$/i);
  if (vault) {
    let account = null;
    try {
      account = getAccount(vault[1], { provider: 'google', filePath: config.accountsFile });
    } catch {
      account = null;
    }
    const alias = text(account?.alias, 100).toLowerCase();
    if (alias) return `google.vault.${alias}`;
    throw new Error(`Secrets broker alias unavailable for connector account: ${vault[1]}`);
  }
  throw new Error(`Secrets broker has no alias mapping for key: ${id.slice(0, 80)}`);
}

function locatorKey(locator) {
  if (locator && typeof locator === 'object') {
    const key = text(locator.key, 500);
    if (key) return key;
  }
  throw new Error('Secrets broker backend resolves secrets by key locator only');
}

class BrokerBackend {
  constructor(config = {}, options = {}) {
    this.config = normalizeConfig({ ...config, ...options.config }, options.env || process.env);
    this.helper = options.helper || __filename;
    this.run = options.run || spawnSync;
    this.env = options.env || process.env;
    this.aliasForKey = options.aliasForKey || aliasForKey;
  }

  ready() {
    if (!fs.existsSync(this.config.socketPath)) return false;
    if (this.config.token) return true;
    if (!this.config.tokenFile) return false;
    try {
      fs.accessSync(this.config.tokenFile, fs.constants.R_OK);
      return true;
    } catch {
      return false;
    }
  }

  #invoke(payload) {
    if (!this.ready()) throw new Error('Secrets broker backend is not configured');
    const result = this.run(process.execPath, [this.helper, '--worker'], {
      input: JSON.stringify({ config: this.config, ...payload }),
      env: this.env,
      encoding: 'utf8',
      timeout: this.config.timeoutMs,
      maxBuffer: 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    if (result.error) throw new Error(`Secrets broker helper failed: ${result.error.message}`);
    if (result.status !== 0) {
      let message = 'Secrets broker helper failed';
      try { message = JSON.parse(result.stderr || result.stdout)?.error || message; } catch {}
      throw new Error(message);
    }
    let parsed;
    try { parsed = JSON.parse(result.stdout); }
    catch { throw new Error('Secrets broker helper returned invalid JSON'); }
    if (!parsed?.ok) throw new Error(text(parsed?.error || 'Secrets broker request failed', 500));
    return parsed;
  }

  get(locator) {
    const key = locatorKey(locator);
    const alias = this.aliasForKey(key, this.config);
    const parsed = this.#invoke({ operation: 'get', alias });
    if (typeof parsed.value !== 'string') throw new Error('Secrets broker secret value is missing');
    return parsed.value;
  }

  create({ key, value } = {}) {
    const secretKey = text(key, 500);
    const secretValue = typeof value === 'string' ? value : '';
    if (!secretKey || !secretValue) throw new Error('Secrets broker key and value are required');
    const alias = this.aliasForKey(secretKey, this.config);
    this.#invoke({ operation: 'put', alias, key: secretKey, data: { value: secretValue } });
    return { id: '', key: secretKey, backend: 'broker' };
  }
}

function brokerRequest(config, token, pathName, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const request = http.request({
      socketPath: config.socketPath,
      path: pathName,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        Authorization: `Bearer ${token}`,
      },
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let parsed = {};
        try { parsed = raw ? JSON.parse(raw) : {}; } catch {}
        if (response.statusCode < 200 || response.statusCode >= 300) {
          const reason = text(parsed?.reason || parsed?.decision || `status ${response.statusCode}`, 300);
          reject(new Error(`Secrets broker request denied (${reason})`));
          return;
        }
        resolve(parsed);
      });
    });
    request.setTimeout(config.timeoutMs, () => {
      request.destroy(new Error('Secrets broker request timed out'));
    });
    request.on('error', reject);
    request.end(body);
  });
}

async function worker(input) {
  const config = normalizeConfig(input.config || {});
  const token = config.token || (config.tokenFile ? fs.readFileSync(config.tokenFile, 'utf8').trim() : '');
  if (!token) throw new Error('Secrets broker agent token is not configured');
  const alias = text(input.alias, 200);
  if (!alias) throw new Error('Secrets broker alias is required');

  if (input.operation === 'get') {
    const result = await brokerRequest(config, token, '/v1/resolve', {
      secret: alias,
      capability: 'secret.read',
      scope: config.scope,
      purpose: config.purpose,
    });
    if (typeof result?.secret !== 'string') throw new Error('Secrets broker returned no secret value');
    return { ok: true, value: result.secret };
  }
  if (input.operation === 'put') {
    const value = input.data && typeof input.data.value === 'string' ? input.data.value : '';
    if (!value) throw new Error('Secrets broker secret value is required');
    await brokerRequest(config, token, '/v1/store', {
      secret: alias,
      capability: 'secret.write',
      scope: config.scope,
      purpose: config.purpose,
      key: text(input.key, 500),
      value,
    });
    return { ok: true };
  }
  throw new Error('unsupported secrets broker helper operation');
}

async function workerMain() {
  let raw = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) raw += chunk;
  try {
    const input = JSON.parse(raw || '{}');
    const result = await worker(input);
    process.stdout.write(JSON.stringify(result));
  } catch (error) {
    process.stderr.write(JSON.stringify({ error: text(error?.message || error, 1000) }));
    process.exitCode = 1;
  }
}

module.exports = {
  DEFAULTS,
  BrokerBackend,
  aliasForKey,
  normalizeConfig,
  worker,
};

if (require.main === module && process.argv.includes('--worker')) workerMain();

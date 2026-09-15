'use strict';

const crypto = require('crypto');
const fs = require('fs');
const { spawnSync } = require('child_process');

const DEFAULTS = Object.freeze({
  addr: 'http://127.0.0.1:8200',
  mount: 'kv',
  roleIdFile: '/etc/3dvr/openbao/broker-role-id',
  secretIdFile: '/etc/3dvr/openbao/broker-secret-id',
  timeoutMs: 15000,
});

function text(value, max = 1000) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function locatorPath(locator) {
  if (typeof locator === 'string') {
    const id = text(locator, 500);
    if (!id) throw new Error('OpenBao secret locator is required');
    return `runtime/by-id/${sha256(id)}`;
  }
  if (!locator || typeof locator !== 'object') throw new Error('OpenBao secret locator is required');
  const key = text(locator.key, 500);
  if (key) return `runtime/by-key/${sha256(key)}`;
  const id = text(locator.id || locator.secretId, 500);
  if (id) return `runtime/by-id/${sha256(id)}`;
  throw new Error('OpenBao secret locator requires key or id');
}

function normalizeConfig(config = {}) {
  const addr = text(config.addr || process.env.BAO_ADDR || DEFAULTS.addr, 2000).replace(/\/+$/, '');
  const mount = text(config.mount || DEFAULTS.mount, 200).replace(/^\/+|\/+$/g, '');
  const roleIdFile = text(config.roleIdFile || DEFAULTS.roleIdFile, 1000);
  const secretIdFile = text(config.secretIdFile || DEFAULTS.secretIdFile, 1000);
  const timeoutMs = Math.max(1000, Math.min(Number(config.timeoutMs || DEFAULTS.timeoutMs), 120000));
  if (!/^https?:\/\//.test(addr)) throw new Error('OpenBao address must be http(s)');
  if (!/^[A-Za-z0-9_-]+$/.test(mount)) throw new Error('OpenBao mount name is invalid');
  return { addr, mount, roleIdFile, secretIdFile, timeoutMs };
}

class OpenBaoBackend {
  constructor(config = {}, options = {}) {
    this.config = normalizeConfig({ ...config, ...options.config });
    this.helper = options.helper || __filename;
    this.run = options.run || spawnSync;
    this.env = options.env || process.env;
  }

  ready() {
    return fs.existsSync(this.config.roleIdFile) && fs.existsSync(this.config.secretIdFile);
  }

  #invoke(payload) {
    if (!this.ready()) throw new Error('OpenBao backend is not configured');
    const result = this.run(process.execPath, [this.helper, '--worker'], {
      input: JSON.stringify({ config: this.config, ...payload }),
      env: this.env,
      encoding: 'utf8',
      timeout: this.config.timeoutMs,
      maxBuffer: 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    if (result.error) throw new Error(`OpenBao helper failed: ${result.error.message}`);
    if (result.status !== 0) {
      let message = 'OpenBao helper failed';
      try { message = JSON.parse(result.stderr || result.stdout)?.error || message; } catch {}
      throw new Error(message);
    }
    let parsed;
    try { parsed = JSON.parse(result.stdout); }
    catch { throw new Error('OpenBao helper returned invalid JSON'); }
    if (!parsed?.ok) throw new Error(text(parsed?.error || 'OpenBao request failed', 500));
    return parsed;
  }

  get(locator) {
    const parsed = this.#invoke({ operation: 'get', path: locatorPath(locator) });
    if (typeof parsed.value !== 'string') throw new Error('OpenBao secret value is missing');
    return parsed.value;
  }

  create({ key, value, id = '', sourceId = '' } = {}) {
    const secretKey = text(key, 500);
    const secretValue = typeof value === 'string' ? value : '';
    const secretId = text(id || sourceId, 500);
    if (!secretKey || !secretValue) throw new Error('OpenBao key and value are required');
    const byKey = locatorPath({ key: secretKey });
    this.#invoke({
      operation: 'put',
      path: byKey,
      data: { key: secretKey, value: secretValue, source_id: secretId },
    });
    if (secretId) {
      this.#invoke({
        operation: 'put',
        path: locatorPath({ id: secretId }),
        data: { key: secretKey, value: secretValue, source_id: secretId },
      });
    }
    return { id: secretId || sha256(secretKey), key: secretKey, backend: 'openbao' };
  }
}

async function requestJson(url, { method = 'GET', token = '', body, timeoutMs = DEFAULTS.timeoutMs } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'X-Vault-Token': token } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const raw = await response.text();
    let parsed = {};
    if (raw) {
      try { parsed = JSON.parse(raw); }
      catch { throw new Error(`OpenBao returned non-JSON response (${response.status})`); }
    }
    if (!response.ok) {
      const detail = Array.isArray(parsed?.errors) ? parsed.errors.join('; ') : '';
      throw new Error(detail || `OpenBao request failed (${response.status})`);
    }
    return parsed;
  } finally {
    clearTimeout(timer);
  }
}

async function worker(input) {
  const config = normalizeConfig(input.config || {});
  const roleId = fs.readFileSync(config.roleIdFile, 'utf8').trim();
  const secretId = fs.readFileSync(config.secretIdFile, 'utf8').trim();
  if (!roleId || !secretId) throw new Error('OpenBao AppRole credentials are empty');
  const login = await requestJson(`${config.addr}/v1/auth/approle/login`, {
    method: 'POST',
    body: { role_id: roleId, secret_id: secretId },
    timeoutMs: config.timeoutMs,
  });
  const token = text(login?.auth?.client_token, 10000);
  if (!token) throw new Error('OpenBao AppRole login returned no token');
  const secretPath = text(input.path, 1000).replace(/^\/+/, '');
  if (!/^runtime\/(by-key|by-id)\/[a-f0-9]{64}$/.test(secretPath)) throw new Error('OpenBao secret path is invalid');
  const url = `${config.addr}/v1/${encodeURIComponent(config.mount)}/data/${secretPath}`;

  if (input.operation === 'get') {
    const result = await requestJson(url, { token, timeoutMs: config.timeoutMs });
    const value = result?.data?.data?.value;
    if (typeof value !== 'string') throw new Error('OpenBao secret value is missing');
    return { ok: true, value };
  }
  if (input.operation === 'put') {
    const data = input.data && typeof input.data === 'object' && !Array.isArray(input.data) ? input.data : {};
    if (typeof data.value !== 'string' || !data.value) throw new Error('OpenBao secret value is required');
    await requestJson(url, { method: 'POST', token, body: { data }, timeoutMs: config.timeoutMs });
    return { ok: true };
  }
  throw new Error('unsupported OpenBao helper operation');
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
  OpenBaoBackend,
  locatorPath,
  normalizeConfig,
  requestJson,
  worker,
};

if (require.main === module && process.argv.includes('--worker')) workerMain();

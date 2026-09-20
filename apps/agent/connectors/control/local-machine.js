'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const run = promisify(execFile);

function csv(value, fallback = []) {
  const source = value === undefined || value === null || value === '' ? fallback : String(value).split(',');
  return [...new Set(source.map(item => String(item).trim()).filter(Boolean))];
}

function bool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return /^(1|true|yes|on)$/i.test(String(value));
}

function loadPolicy(config = process.env) {
  const home = os.homedir();
  return {
    enableMutations: bool(config.THREEDVR_CONTROL_ENABLE_MUTATIONS, false),
    fileRoots: csv(config.THREEDVR_CONTROL_FILE_ROOTS, [
      path.join(home, '.3dvr'),
      '/opt/3dvr',
      '/var/lib/3dvr',
      '/var/log/3dvr-control-mcp',
    ]).map(item => path.resolve(item)),
    services: csv(config.THREEDVR_CONTROL_SERVICES, [
      '3dvr-personal-mcp.service',
      '3dvr-control-mcp.service',
      '3dvr-agent-stack.service',
      '3dvr-self-host-portal.service',
      '3dvr-secrets-broker.service',
      'openbao.service',
    ]),
    maxReadBytes: Math.max(1024, Number(config.THREEDVR_CONTROL_MAX_READ_BYTES || 1_048_576)),
    maxWriteBytes: Math.max(1024, Number(config.THREEDVR_CONTROL_MAX_WRITE_BYTES || 1_048_576)),
    serviceHelper: config.THREEDVR_CONTROL_SERVICE_HELPER || '/usr/local/sbin/3dvr-control-service',
    commandFile: config.THREEDVR_CONTROL_COMMANDS_FILE || '/etc/3dvr/control-mcp/commands.json',
  };
}

function assertServiceAllowed(service, policy) {
  const name = String(service || '').trim();
  if (!name || !policy.services.includes(name)) throw new Error(`service is not allowed: ${name || '<missing>'}`);
  return name;
}

function withinRoot(candidate, root) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function resolveAllowedPath(input, policy, { mustExist = false } = {}) {
  const requested = path.resolve(String(input || ''));
  if (!requested || requested === path.parse(requested).root) throw new Error('path is missing or too broad');

  let candidate = requested;
  if (mustExist) {
    candidate = fs.realpathSync(requested);
  } else {
    const parent = fs.realpathSync(path.dirname(requested));
    candidate = path.join(parent, path.basename(requested));
  }

  const roots = policy.fileRoots.map((root) => {
    try { return fs.realpathSync(root); } catch { return path.resolve(root); }
  });
  if (!roots.some(root => withinRoot(candidate, root))) throw new Error(`path is outside configured roots: ${requested}`);
  return candidate;
}

function hostStatus() {
  const [one, five, fifteen] = os.loadavg();
  const total = os.totalmem();
  const free = os.freemem();
  return {
    hostname: os.hostname(),
    platform: os.platform(),
    release: os.release(),
    arch: os.arch(),
    uptimeSeconds: Math.floor(os.uptime()),
    load: { one, five, fifteen },
    memory: {
      totalBytes: total,
      availableBytes: free,
      usedPercent: total ? Math.round(((total - free) / total) * 1000) / 10 : 0,
    },
    node: process.version,
  };
}

function parseSystemctlShow(stdout) {
  return Object.fromEntries(String(stdout || '')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const index = line.indexOf('=');
      return index < 0 ? [line, ''] : [line.slice(0, index), line.slice(index + 1)];
    }));
}

async function serviceStatus(service, { policy = loadPolicy(), runImpl = run } = {}) {
  const name = assertServiceAllowed(service, policy);
  const { stdout } = await runImpl('systemctl', [
    'show', name,
    '--no-pager',
    '--property=Id,Description,LoadState,ActiveState,SubState,UnitFileState,MainPID,FragmentPath',
  ], { timeout: 5000, maxBuffer: 100_000, env: process.env });
  const row = parseSystemctlShow(stdout);
  return {
    service: name,
    description: row.Description || '',
    loadState: row.LoadState || '',
    activeState: row.ActiveState || '',
    subState: row.SubState || '',
    unitFileState: row.UnitFileState || '',
    mainPid: Number(row.MainPID || 0),
    fragmentPath: row.FragmentPath || '',
  };
}

async function serviceAction(service, action, { policy = loadPolicy(), runImpl = run } = {}) {
  if (!policy.enableMutations) throw new Error('mutating control capabilities are disabled');
  const name = assertServiceAllowed(service, policy);
  const operation = String(action || '').trim().toLowerCase();
  if (!['start', 'stop', 'restart'].includes(operation)) throw new Error(`unsupported service action: ${operation}`);
  await runImpl(policy.serviceHelper, [operation, name], {
    timeout: 30_000,
    maxBuffer: 100_000,
    env: process.env,
  });
  return serviceStatus(name, { policy, runImpl });
}

function fileRead(filePath, { policy = loadPolicy() } = {}) {
  const resolved = resolveAllowedPath(filePath, policy, { mustExist: true });
  const stat = fs.statSync(resolved);
  if (!stat.isFile()) throw new Error('path is not a regular file');
  if (stat.size > policy.maxReadBytes) throw new Error(`file exceeds read limit (${policy.maxReadBytes} bytes)`);
  return {
    path: resolved,
    size: stat.size,
    modifiedAt: stat.mtime.toISOString(),
    content: fs.readFileSync(resolved, 'utf8'),
  };
}

function fileList(dirPath, { policy = loadPolicy(), limit = 200 } = {}) {
  const resolved = resolveAllowedPath(dirPath, policy, { mustExist: true });
  const stat = fs.statSync(resolved);
  if (!stat.isDirectory()) throw new Error('path is not a directory');
  const max = Math.max(1, Math.min(Number(limit) || 200, 500));
  const all = fs.readdirSync(resolved, { withFileTypes: true });
  const entries = all.slice(0, max).map(entry => ({
    name: entry.name,
    type: entry.isDirectory() ? 'directory' : entry.isFile() ? 'file' : entry.isSymbolicLink() ? 'symlink' : 'other',
  }));
  return { path: resolved, entries, truncated: all.length > entries.length };
}

function fileWrite(filePath, content, { policy = loadPolicy() } = {}) {
  if (!policy.enableMutations) throw new Error('mutating control capabilities are disabled');
  const text = String(content ?? '');
  if (Buffer.byteLength(text, 'utf8') > policy.maxWriteBytes) throw new Error(`content exceeds write limit (${policy.maxWriteBytes} bytes)`);
  const resolved = resolveAllowedPath(filePath, policy, { mustExist: false });
  const temp = `${resolved}.3dvr-${process.pid}-${Date.now()}.tmp`;
  fs.writeFileSync(temp, text, { mode: 0o600, flag: 'wx' });
  fs.renameSync(temp, resolved);
  const stat = fs.statSync(resolved);
  return { path: resolved, size: stat.size, modifiedAt: stat.mtime.toISOString() };
}

function loadCommands({ policy = loadPolicy() } = {}) {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(policy.commandFile, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw new Error(`unable to load command policy: ${error.message}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('command policy must be a JSON object');
  return parsed;
}

async function runCommand(commandId, {
  policy = loadPolicy(),
  commands = loadCommands({ policy }),
  runImpl = run,
  resolveSecrets,
} = {}) {
  const id = String(commandId || '').trim();
  const command = commands[id];
  if (!id || !command || typeof command !== 'object') throw new Error(`unknown command id: ${id || '<missing>'}`);
  if (command.mutating !== false && !policy.enableMutations) throw new Error('mutating control capabilities are disabled');
  if (!path.isAbsolute(String(command.file || ''))) throw new Error('command file must be an absolute path');
  if (!Array.isArray(command.args || [])) throw new Error('command args must be an array');

  const extraEnv = typeof resolveSecrets === 'function'
    ? await resolveSecrets(command.secretEnv || {})
    : {};
  const timeout = Math.max(1000, Math.min(Number(command.timeoutMs || 30_000), 300_000));
  const redact = (value) => {
    let text = String(value || '');
    for (const secret of Object.values(extraEnv)) {
      const needle = String(secret || '');
      if (needle) text = text.split(needle).join('[REDACTED]');
    }
    return text;
  };
  let stdout;
  let stderr;
  try {
    ({ stdout, stderr } = await runImpl(command.file, command.args || [], {
      timeout,
      maxBuffer: 1_000_000,
      env: { ...process.env, ...extraEnv },
    }));
  } catch (error) {
    error.message = redact(error.message);
    if ('stdout' in error) error.stdout = redact(error.stdout);
    if ('stderr' in error) error.stderr = redact(error.stderr);
    throw error;
  }
  return {
    commandId: id,
    mutating: command.mutating !== false,
    stdout: redact(stdout).slice(0, 200_000),
    stderr: redact(stderr).slice(0, 50_000),
  };
}


async function cdpCall(wsUrl, method, params = {}) {
  const ws = new WebSocket(wsUrl);
  let nextId = 1;
  const pending = new Map();
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('CDP websocket open timed out')), 5000);
    ws.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
    ws.addEventListener('error', () => { clearTimeout(timer); reject(new Error('CDP websocket failed')); }, { once: true });
  });
  ws.addEventListener('message', (event) => {
    let message;
    try { message = JSON.parse(String(event.data || '')); } catch { return; }
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message || 'CDP command failed'));
    else resolve(message.result || {});
  });
  const send = (name, payload = {}) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method: name, params: payload }));
  });
  try {
    return await send(method, params);
  } finally {
    try { ws.close(); } catch {}
  }
}

async function storeOpenAiAdminFromBrowserClipboard({
  cdpPort = 9444,
  secretKey = 'OPENAI_ADMIN_KEY',
} = {}) {
  const base = `http://127.0.0.1:${cdpPort}`;
  const [versionResponse, targetsResponse] = await Promise.all([
    fetch(`${base}/json/version`),
    fetch(`${base}/json/list`),
  ]);
  if (!versionResponse.ok || !targetsResponse.ok) throw new Error('OpenAI browser CDP is unavailable');

  const version = await versionResponse.json();
  const targets = await targetsResponse.json();
  const page = Array.isArray(targets)
    ? targets.find(item => item?.type === 'page' && String(item?.url || '').startsWith('https://platform.openai.com/'))
    : null;
  if (!page?.webSocketDebuggerUrl) throw new Error('No authenticated OpenAI Platform tab is available');
  if (!version?.webSocketDebuggerUrl) throw new Error('Chrome browser websocket is unavailable');

  await cdpCall(version.webSocketDebuggerUrl, 'Browser.grantPermissions', {
    origin: 'https://platform.openai.com',
    permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'],
  });

  const read = await cdpCall(page.webSocketDebuggerUrl, 'Runtime.evaluate', {
    expression: 'navigator.clipboard.readText()',
    awaitPromise: true,
    returnByValue: true,
  });
  let value = read?.result?.value;
  if (typeof value !== 'string' || !value.trim()) throw new Error('OpenAI browser clipboard is empty');
  value = value.trim();
  if (!/^sk-[A-Za-z0-9_-]{20,}$/.test(value)) throw new Error('Clipboard does not contain an OpenAI API credential');

  const { OpenBaoBackend } = require('/opt/3dvr/secrets-broker/openbao.js');
  const backend = new OpenBaoBackend();
  backend.create({
    key: secretKey,
    value,
    sourceId: 'openai-admin-bootstrap',
  });

  await cdpCall(page.webSocketDebuggerUrl, 'Runtime.evaluate', {
    expression: "navigator.clipboard.writeText('')",
    awaitPromise: true,
    returnByValue: true,
  }).catch(() => {});
  value = '';

  return { stored: true, key: secretKey, backend: 'openbao', clipboardCleared: true };
}


const DEFAULT_HANDOFF_STATE = '/var/lib/3dvr/secret-handoff/state.json';
const DEFAULT_HANDOFF_ORIGIN = 'https://portal.3dvr.tech';
const DEFAULT_N8N_TARGETS = Object.freeze({
  cvw: Object.freeze({
    label: 'Tom / CVW',
    baseUrl: 'https://178.105.247.138.nip.io',
    secretKey: 'CVW_N8N_API_KEY',
  }),
});

function secureText(value, max = 1000) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

function secureOpenBaoBackend(options = {}) {
  if (options.backend) return options.backend;
  const { OpenBaoBackend } = require('/opt/3dvr/secrets-broker/openbao.js');
  return new OpenBaoBackend();
}

function secretStatus(key, options = {}) {
  const secretKey = secureText(key, 500);
  if (!secretKey) throw new Error('secret key is required');
  const backend = secureOpenBaoBackend(options);
  if (typeof backend.ready === 'function' && !backend.ready()) throw new Error('OpenBao backend is not configured');
  try {
    const value = backend.get({ key: secretKey });
    return { key: secretKey, exists: typeof value === 'string' && value.length > 0, backend: 'openbao' };
  } catch (error) {
    if (/(?:404|not found|missing|secret value is missing)/i.test(String(error?.message || error || ''))) {
      return { key: secretKey, exists: false, backend: 'openbao' };
    }
    throw error;
  }
}

function handoffStateFile(config = {}) {
  return secureText(config.THREEDVR_SECRET_HANDOFF_STATE || DEFAULT_HANDOFF_STATE, 2000);
}

function readHandoffState(config = {}) {
  const file = handoffStateFile(config);
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return { version: 1, requests: parsed?.requests && typeof parsed.requests === 'object' ? parsed.requests : {} };
  } catch (error) {
    if (error?.code === 'ENOENT') return { version: 1, requests: {} };
    throw error;
  }
}

function writeHandoffState(config, state) {
  const file = handoffStateFile(config);
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(state, null, 2) + '\\n', { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  fs.chmodSync(temp, 0o600);
  fs.renameSync(temp, file);
}

function pruneHandoffState(state, now = Date.now()) {
  for (const [id, record] of Object.entries(state.requests || {})) {
    const expiresAt = Date.parse(record?.expiresAt || '');
    const completedAt = Date.parse(record?.submittedAt || record?.cancelledAt || '');
    if ((Number.isFinite(expiresAt) && expiresAt < now - 7 * 86400000)
      || (Number.isFinite(completedAt) && completedAt < now - 30 * 86400000)) {
      delete state.requests[id];
    }
  }
}

async function createSecretHandoff({ key, label, purpose = '', recipient = '', ttlMinutes = 1440 } = {}, options = {}) {
  const config = options.config || process.env;
  const secretKey = secureText(key, 500);
  const humanLabel = secureText(label || key, 200);
  const normalizedPurpose = secureText(purpose, 1000);
  const normalizedRecipient = secureText(recipient, 200);
  const lifetime = Math.max(10, Math.min(Number(ttlMinutes) || 1440, 10080));
  if (!secretKey || !humanLabel) throw new Error('destination key and label are required');

  const id = `sh-${crypto.randomBytes(12).toString('base64url')}`;
  const token = crypto.randomBytes(32).toString('base64url');
  const keyPair = await crypto.webcrypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const publicKey = await crypto.webcrypto.subtle.exportKey('jwk', keyPair.publicKey);
  const privateKey = await crypto.webcrypto.subtle.exportKey('jwk', keyPair.privateKey);
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + lifetime * 60000).toISOString();
  const state = readHandoffState(config);
  pruneHandoffState(state);
  state.requests[id] = {
    id, key: secretKey, label: humanLabel, purpose: normalizedPurpose, recipient: normalizedRecipient,
    createdAt, expiresAt, status: 'pending',
    tokenHash: crypto.createHash('sha256').update(token, 'utf8').digest('hex'),
    publicKey, privateKey, protocol: '3dvr-secret-handoff/1', createdBy: 'local-control-mcp',
  };
  writeHandoffState(config, state);

  const origin = secureText(config.THREEDVR_SECRET_HANDOFF_PUBLIC_ORIGIN || DEFAULT_HANDOFF_ORIGIN, 1000).replace(/\/+$/, '');
  return {
    ok: true, id, key: secretKey, expiresAt,
    shareUrl: `${origin}/secret-handoff/?id=${encodeURIComponent(id)}#token=${token}`,
    protocol: '3dvr-secret-handoff/1',
  };
}

function n8nTargets(config = process.env) {
  const targets = { ...DEFAULT_N8N_TARGETS };
  const raw = secureText(config.THREEDVR_N8N_TARGETS_JSON, 10000);
  if (raw) {
    let parsed;
    try { parsed = JSON.parse(raw); } catch { throw new Error('THREEDVR_N8N_TARGETS_JSON is invalid JSON'); }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('THREEDVR_N8N_TARGETS_JSON must be an object');
    for (const [id, target] of Object.entries(parsed)) {
      if (!target || typeof target !== 'object' || Array.isArray(target)) continue;
      targets[id] = {
        label: secureText(target.label || id, 200),
        baseUrl: secureText(target.baseUrl, 2000),
        secretKey: secureText(target.secretKey, 500),
      };
    }
  }
  return targets;
}

function resolveN8nTarget(targetId, config = process.env) {
  const id = secureText(targetId || 'cvw', 100);
  const target = n8nTargets(config)[id];
  if (!target) throw new Error(`unknown n8n target: ${id}`);
  if (!/^https:\/\//i.test(target.baseUrl || '')) throw new Error(`n8n target must use HTTPS: ${id}`);
  if (!target.secretKey) throw new Error(`n8n target has no secret key mapping: ${id}`);
  return { id, ...target, baseUrl: target.baseUrl.replace(/\/+$/, '') };
}

async function n8nReadJson(response) {
  const raw = await response.text();
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { throw new Error(`n8n returned non-JSON response (${response.status})`); }
}

async function n8nApiRequest(targetId, pathname, options = {}) {
  const config = options.config || process.env;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('fetch is unavailable');
  const target = resolveN8nTarget(targetId, config);
  const backend = secureOpenBaoBackend(options);
  if (typeof backend.ready === 'function' && !backend.ready()) throw new Error('OpenBao backend is not configured');
  let apiKey = backend.get({ key: target.secretKey });
  if (typeof apiKey !== 'string' || !apiKey.trim()) throw new Error('n8n API key is unavailable');
  apiKey = apiKey.trim();

  const url = new URL(pathname, `${target.baseUrl}/`);
  for (const [key, value] of Object.entries(options.query || {})) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }
  let response;
  try {
    response = await fetchImpl(url, {
      method: 'GET',
      headers: { Accept: 'application/json', 'X-N8N-API-KEY': apiKey },
      redirect: 'manual',
    });
  } finally {
    apiKey = '';
  }
  if (response.status >= 300 && response.status < 400) throw new Error(`n8n API redirected unexpectedly (${response.status})`);
  if (!response.ok) throw new Error(`n8n API request failed (${response.status})`);
  return { target, status: response.status, body: await n8nReadJson(response) };
}

async function n8nStatus(targetId = 'cvw', options = {}) {
  const config = options.config || process.env;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const target = resolveN8nTarget(targetId, config);
  let health = { ok: false, status: 0 };
  try {
    const response = await fetchImpl(new URL('/healthz', `${target.baseUrl}/`), { headers: { Accept: 'application/json' }, redirect: 'manual' });
    health = { ok: response.ok, status: response.status };
  } catch {}
  const api = await n8nApiRequest(target.id, '/api/v1/workflows', { ...options, config, fetchImpl, query: { limit: 1, excludePinnedData: true } });
  return { target: { id: target.id, label: target.label, baseUrl: target.baseUrl }, health, api: { ok: true, status: api.status, authorized: true } };
}

function safeN8nWorkflow(row = {}) {
  return {
    id: String(row.id ?? ''),
    name: secureText(row.name, 300),
    active: Boolean(row.active),
    isArchived: Boolean(row.isArchived),
    createdAt: row.createdAt || null,
    updatedAt: row.updatedAt || null,
    tags: Array.isArray(row.tags) ? row.tags.slice(0, 20).map(tag => ({ id: String(tag?.id ?? ''), name: secureText(tag?.name, 200) })) : [],
  };
}

async function n8nWorkflows({ target = 'cvw', active, limit = 25 } = {}, options = {}) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 25, 100));
  const result = await n8nApiRequest(target, '/api/v1/workflows', {
    ...options,
    query: { limit: safeLimit, excludePinnedData: true, ...(typeof active === 'boolean' ? { active } : {}) },
  });
  const rows = Array.isArray(result.body?.data) ? result.body.data : [];
  return { target: { id: result.target.id, label: result.target.label }, workflows: rows.map(safeN8nWorkflow), nextCursor: secureText(result.body?.nextCursor, 1000) || null };
}

function safeN8nExecution(row = {}) {
  return {
    id: String(row.id ?? ''),
    workflowId: String(row.workflowId ?? ''),
    status: secureText(row.status, 50),
    mode: secureText(row.mode, 50),
    finished: Boolean(row.finished),
    startedAt: row.startedAt || null,
    stoppedAt: row.stoppedAt || null,
    waitTill: row.waitTill || null,
    retryOf: row.retryOf == null ? null : String(row.retryOf),
    retrySuccessId: row.retrySuccessId == null ? null : String(row.retrySuccessId),
  };
}

async function n8nExecutions({ target = 'cvw', workflowId, status, limit = 25 } = {}, options = {}) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 25, 100));
  const result = await n8nApiRequest(target, '/api/v1/executions', {
    ...options,
    query: {
      limit: safeLimit, includeData: false,
      ...(workflowId ? { workflowId: secureText(workflowId, 200) } : {}),
      ...(status ? { status: secureText(status, 50) } : {}),
    },
  });
  const rows = Array.isArray(result.body?.data) ? result.body.data : [];
  return { target: { id: result.target.id, label: result.target.label }, executions: rows.map(safeN8nExecution), nextCursor: secureText(result.body?.nextCursor, 1000) || null };
}

module.exports = {
  assertServiceAllowed,
  fileList,
  fileRead,
  fileWrite,
  hostStatus,
  loadCommands,
  loadPolicy,
  parseSystemctlShow,
  resolveAllowedPath,
  runCommand,
  serviceAction,
  serviceStatus,
  storeOpenAiAdminFromBrowserClipboard,
  createSecretHandoff,
  n8nApiRequest,
  n8nExecutions,
  n8nStatus,
  n8nTargets,
  n8nWorkflows,
  resolveN8nTarget,
  secretStatus,
};

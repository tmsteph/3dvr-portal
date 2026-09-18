'use strict';

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
};

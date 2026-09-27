const { callOvhTool } = require('../../connectors/control/ovh-mcp');
const { serversHealth } = require('../../connectors/control/servers');
const { appendAudit } = require('../../connectors/audit/log');
const { authorizePortalServerControl } = require('./operator-server-control-auth');

const DEFAULT_LIMIT = 5;
const DEFAULT_READ_TIMEOUT_MS = 1800;
const DEFAULT_RELAY_FLUSH_MS = 1200;
let defaultGun = null;

function getDefaultGun() {
  if (!defaultGun) defaultGun = require('./gun-db').gun;
  return defaultGun;
}

function requestsNode(options = {}) {
  return options.rootNode || getDefaultGun().get('3dvr-portal').get('control').get('serverRequests');
}

function putGun(node, payload, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('server-control write timeout'));
    }, timeoutMs);
    node.put(payload, ack => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (ack?.err) reject(new Error(ack.err));
      else resolve(ack || {});
    });
  });
}

function listServerRequests(options = {}) {
  const node = requestsNode(options);
  const timeoutMs = options.timeoutMs || DEFAULT_READ_TIMEOUT_MS;
  return new Promise(resolve => {
    const rows = new Map();
    const finish = () => resolve(
      [...rows.values()].sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')))
    );
    const timer = setTimeout(finish, timeoutMs);
    node.map().once((data, key) => {
      if (data && data.id) rows.set(key, data);
    });
    if (options.rootNode) {
      clearTimeout(timer);
      finish();
    }
  });
}

async function updateServerRequest(id, patch, options = {}) {
  await putGun(requestsNode(options).get(id), {
    ...patch,
    id,
    updatedAt: patch.updatedAt || new Date().toISOString(),
  }, options.writeTimeoutMs);
}

function resultSummary(value) {
  const raw = JSON.stringify(value);
  return raw.length > 2000 ? `${raw.slice(0, 2000)}…` : raw;
}

async function executeServerControl(auth, options = {}) {
  const callOvhToolImpl = options.callOvhToolImpl || callOvhTool;
  const serversHealthImpl = options.serversHealthImpl || serversHealth;
  if (auth.operation === 'health') {
    return serversHealthImpl({ servers: [auth.server] });
  }
  if (auth.operation === 'service_status') {
    return callOvhToolImpl('service_status', { service: auth.service });
  }
  if (auth.operation === 'service_restart') {
    return callOvhToolImpl('service_restart', { service: auth.service });
  }
  throw new Error('Unsupported server-control operation.');
}

async function runServerControlRequest(record, options = {}) {
  const authorizeImpl = options.authorizeImpl || authorizePortalServerControl;
  const auth = await authorizeImpl(record, options);
  if (!auth.ok) {
    await updateServerRequest(record.id, {
      status: 'rejected',
      error: auth.reason,
      resultSummary: auth.reason,
    }, options);
    return { ok: false, rejected: true, reason: auth.reason };
  }

  await updateServerRequest(record.id, {
    status: 'running',
    workerStartedAt: new Date().toISOString(),
    error: '',
  }, options);

  const auditImpl = options.auditImpl || appendAudit;
  try {
    const result = await executeServerControl(auth, options);
    const summary = resultSummary(result);
    await updateServerRequest(record.id, {
      status: 'completed',
      completedAt: new Date().toISOString(),
      resultSummary: summary,
      error: '',
    }, options);
    auditImpl({
      actor: 'portal-operator',
      tool: `server.${auth.operation}`,
      target: auth.operation === 'health' ? auth.server : `${auth.server}:${auth.service}`,
      result: 'success',
    });
    return { ok: true, result };
  } catch (error) {
    const message = error?.message || String(error);
    await updateServerRequest(record.id, {
      status: 'failed',
      completedAt: new Date().toISOString(),
      resultSummary: message,
      error: message,
    }, options);
    auditImpl({
      actor: 'portal-operator',
      tool: `server.${auth.operation}`,
      target: auth.operation === 'health' ? auth.server : `${auth.server}:${auth.service}`,
      result: 'error',
      error: message,
    });
    return { ok: false, error: message };
  }
}

async function runServerControlWorkerOnce(options = {}) {
  const requests = await listServerRequests(options);
  const queued = requests
    .filter(record => record.status === 'queued')
    .slice(0, options.limit || DEFAULT_LIMIT);
  const results = [];
  for (const record of queued) {
    results.push({ id: record.id, result: await runServerControlRequest(record, options) });
  }
  return results;
}

async function cli(argv = process.argv.slice(2)) {
  const command = argv[0] || 'run-once';
  const json = argv.includes('--json');
  if (command !== 'run-once') {
    console.log('Usage: node operator-server-control-worker.js run-once [--json]');
    return;
  }
  const results = await runServerControlWorkerOnce();
  console.log(json ? JSON.stringify(results, null, 2) : `Processed ${results.length} server-control request(s).`);
  if (results.length) {
    const configured = Number.parseInt(String(process.env.THREEDVR_OPERATOR_CONTROL_FLUSH_MS || ''), 10);
    const flushMs = Number.isFinite(configured) && configured >= 0 ? configured : DEFAULT_RELAY_FLUSH_MS;
    if (flushMs) await new Promise(resolve => setTimeout(resolve, flushMs));
  }
}

module.exports = {
  executeServerControl,
  listServerRequests,
  runServerControlRequest,
  runServerControlWorkerOnce,
  updateServerRequest,
};

if (require.main === module) {
  cli().then(() => process.exit(0)).catch(error => {
    console.error(error.message || error);
    process.exit(1);
  });
}

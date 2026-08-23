const { gun } = require('./gun-db');
const { runAgentTask } = require('./task-orchestrator');
const { authorizePortalOperatorTask } = require('./operator-forge-auth');

const DEFAULT_LIMIT = 5;
const DEFAULT_READ_TIMEOUT_MS = 1800;
const EXTERNAL_WRITE_PATTERN = /\b(push|merge|deploy|publish|release|pull request|open a pr|create a pr|send|email|post)\b/i;

function normalizeText(value = '') {
  return String(value || '').trim();
}

function forgeRequestsNode(options = {}) {
  return options.rootNode || gun.get('3dvr-portal').get('forge').get('editRequests');
}

function putGun(node, payload, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('operator forge write timeout'));
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

function listForgeRequests(options = {}) {
  const node = forgeRequestsNode(options);
  const timeoutMs = options.timeoutMs || DEFAULT_READ_TIMEOUT_MS;
  return new Promise(resolve => {
    const rows = new Map();
    const timer = setTimeout(() => {
      resolve([...rows.values()].sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || ''))));
    }, timeoutMs);
    node.map().once((data, key) => {
      if (data && data.id) rows.set(key, data);
    });
    if (options.rootNode) {
      clearTimeout(timer);
      resolve([...rows.values()].sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || ''))));
    }
  });
}

async function updateForgeRequest(id, patch, options = {}) {
  const node = forgeRequestsNode(options).get(id);
  await putGun(node, {
    ...patch,
    id,
    updatedAt: patch.updatedAt || new Date().toISOString(),
  }, options.writeTimeoutMs);
}

function editOnlyTask(record = {}) {
  const task = normalizeText(record.task);
  if (!task) return { ok: false, reason: 'missing code edit request' };
  if (EXTERNAL_WRITE_PATTERN.test(task)) {
    return { ok: false, reason: 'maintainer approval is required for publishing, PR, merge, or deployment actions' };
  }
  return { ok: true, task };
}

async function runForgeRequest(record, options = {}) {
  const auth = await authorizePortalOperatorTask(record, {
    env: options.env || process.env,
    verifyImpl: options.verifyImpl,
    now: options.now,
    maxAgeMs: options.maxAgeMs,
  });
  if (!auth.ok) {
    await updateForgeRequest(record.id, {
      status: 'rejected',
      error: auth.reason,
      resultSummary: auth.reason,
    }, options);
    return { ok: false, rejected: true, reason: auth.reason };
  }

  const edit = editOnlyTask(record);
  if (!edit.ok) {
    await updateForgeRequest(record.id, {
      status: 'approval_required',
      error: edit.reason,
      resultSummary: edit.reason,
    }, options);
    return { ok: false, skipped: true, reason: edit.reason };
  }

  await updateForgeRequest(record.id, {
    status: 'running',
    workerStartedAt: new Date().toISOString(),
    error: '',
  }, options);

  try {
    const runImpl = options.runAgentTaskImpl || runAgentTask;
    const result = await runImpl([
      '--backend', record.backend || 'auto',
      '--execute',
      '--no-print-prompt',
      '--repo', auth.repoPath,
      edit.task,
    ], options.hooks || {});
    const summary = normalizeText(result?.reason || result?.result?.stdout || result?.result?.stderr || `ok=${Boolean(result?.ok)}`).slice(0, 2000);
    await updateForgeRequest(record.id, {
      status: result?.ok ? 'completed' : result?.skipped ? 'approval_required' : 'failed',
      completedAt: new Date().toISOString(),
      resultSummary: summary,
      error: result?.ok ? '' : summary,
    }, options);
    return result;
  } catch (error) {
    const message = error.message || String(error);
    await updateForgeRequest(record.id, {
      status: 'failed',
      completedAt: new Date().toISOString(),
      resultSummary: message,
      error: message,
    }, options);
    return { ok: false, error: message };
  }
}

async function runForgeWorkerOnce(options = {}) {
  const requests = await listForgeRequests(options);
  const queued = requests.filter(record => record.status === 'queued').slice(0, options.limit || DEFAULT_LIMIT);
  const results = [];
  for (const record of queued) {
    results.push({ id: record.id, result: await runForgeRequest(record, options) });
  }
  return results;
}

async function cli(argv = process.argv.slice(2)) {
  const command = argv[0] || 'run-once';
  const json = argv.includes('--json');
  if (command !== 'run-once') {
    console.log('Usage: node operator-forge-worker.js run-once [--json]');
    return;
  }
  const results = await runForgeWorkerOnce();
  console.log(json ? JSON.stringify(results, null, 2) : `Processed ${results.length} operator forge request(s).`);
}

module.exports = {
  editOnlyTask,
  listForgeRequests,
  runForgeRequest,
  runForgeWorkerOnce,
  updateForgeRequest,
};

if (require.main === module) {
  cli().then(() => process.exit(0)).catch(error => {
    console.error(error.message || error);
    process.exit(1);
  });
}

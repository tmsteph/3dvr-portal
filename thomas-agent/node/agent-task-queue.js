const crypto = require('node:crypto');
const {
  DEFAULT_OWNER_ALIAS,
  claimLease,
  deviceId,
  ownerNode,
  putGun,
  releaseLease,
  scopedKey,
  writeHeartbeat,
} = require('./agent-ops');

const DEFAULT_BACKEND = process.env.THREEDVR_AGENT_TASK_QUEUE_BACKEND || process.env.THREEDVR_AGENT_TASK_BACKEND || 'auto';
const DEFAULT_WORKER_INTERVAL_SECONDS = parseInteger(process.env.THREEDVR_AGENT_WORKER_INTERVAL_SECONDS, 20);
const DEFAULT_TASK_LIMIT = parseInteger(process.env.THREEDVR_AGENT_WORKER_LIMIT, 10);
const DEFAULT_LEASE_TTL_MS = parseInteger(process.env.THREEDVR_AGENT_WORKER_LEASE_TTL_MS, 30 * 60 * 1000);
const DEFAULT_TENANT_PLAN = process.env.THREEDVR_AGENT_TENANT_PLAN || 'free';
const DEFAULT_WORKER_CAPABILITIES = process.env.THREEDVR_AGENT_WORKER_CAPABILITIES || 'node,auto,codex,openai,claude,openclaw,shell';
const DEFAULT_WORKER_RISK_CLASSES = process.env.THREEDVR_AGENT_WORKER_RISK_CLASSES || 'read_only,draft,workspace_write';
const VALID_RISK_CLASSES = new Set(['read_only', 'draft', 'workspace_write', 'external_write', 'money', 'credential']);
const APPROVAL_REQUIRED_RISKS = new Set(['external_write', 'money', 'credential']);

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeCsv(value) {
  const values = Array.isArray(value)
    ? value
    : String(value || '').split(',');
  return [...new Set(values
    .map(item => normalizeText(item).toLowerCase())
    .filter(Boolean))]
    .join(',');
}

function csvToList(value) {
  return normalizeCsv(value).split(',').filter(Boolean);
}

function nowIso(now = Date.now()) {
  return new Date(now).toISOString();
}

function queueNode(options = {}) {
  return ownerNode(options).get('taskQueue');
}

function taskNode(id, options = {}) {
  return queueNode(options).get('tasks').get(id);
}

function makeTaskId(task, now = Date.now()) {
  const seed = `${normalizeText(task)}\n${now}\n${crypto.randomBytes(6).toString('hex')}`;
  return scopedKey('remote-task', seed);
}

function normalizeRiskClass(value) {
  const risk = normalizeText(value).toLowerCase() || 'draft';
  return VALID_RISK_CLASSES.has(risk) ? risk : 'draft';
}

function defaultApprovalStatus(record = {}) {
  if (normalizeText(record.approvalStatus)) return normalizeText(record.approvalStatus);
  if (record.unsafe) return 'approved';
  return APPROVAL_REQUIRED_RISKS.has(normalizeRiskClass(record.riskClass)) ? 'required' : 'not_required';
}

function normalizeTenantRecord(record = {}) {
  const tenantId = normalizeText(record.tenantId) || normalizeText(record.ownerAlias) || DEFAULT_OWNER_ALIAS;
  return {
    tenantId,
    tenantAlias: normalizeText(record.tenantAlias) || normalizeText(record.requestedBy) || tenantId,
    tenantPlan: normalizeText(record.tenantPlan) || DEFAULT_TENANT_PLAN,
  };
}

function normalizeTaskRecord(record = {}) {
  const tenant = normalizeTenantRecord(record);
  const riskClass = normalizeRiskClass(record.riskClass);
  return {
    id: normalizeText(record.id),
    task: normalizeText(record.task),
    tenantId: tenant.tenantId,
    tenantAlias: tenant.tenantAlias,
    tenantPlan: tenant.tenantPlan,
    backend: normalizeText(record.backend) || DEFAULT_BACKEND,
    repo: normalizeText(record.repo),
    model: normalizeText(record.model),
    thinking: normalizeText(record.thinking),
    unsafe: Boolean(record.unsafe),
    riskClass,
    approvalStatus: defaultApprovalStatus({ ...record, riskClass }),
    requiredCapabilities: normalizeCsv(record.requiredCapabilities || record.requires || record.backend || DEFAULT_BACKEND),
    maxRuntimeMs: parseInteger(record.maxRuntimeMs, 0),
    status: normalizeText(record.status) || 'queued',
    createdAt: normalizeText(record.createdAt) || nowIso(),
    updatedAt: normalizeText(record.updatedAt) || nowIso(),
    requestedBy: normalizeText(record.requestedBy) || 'cli',
    resultSummary: normalizeText(record.resultSummary),
    error: normalizeText(record.error),
    workerDeviceId: normalizeText(record.workerDeviceId),
  };
}

async function enqueueTask(task, options = {}) {
  const text = normalizeText(task);
  if (!text) throw new Error('Task is required.');
  const now = options.now || Date.now();
  const id = options.id || makeTaskId(text, now);
  const record = normalizeTaskRecord({
    id,
    task: text,
    tenantId: options.tenantId,
    tenantAlias: options.tenantAlias,
    tenantPlan: options.tenantPlan,
    ownerAlias: options.ownerAlias,
    backend: options.backend || DEFAULT_BACKEND,
    repo: options.repo,
    model: options.model,
    thinking: options.thinking,
    unsafe: options.unsafe,
    riskClass: options.riskClass || options.risk,
    approvalStatus: options.approvalStatus,
    requiredCapabilities: options.requiredCapabilities || options.requires,
    maxRuntimeMs: options.maxRuntimeMs,
    status: 'queued',
    createdAt: nowIso(now),
    updatedAt: nowIso(now),
    requestedBy: options.requestedBy || 'cli',
  });
  await putGun(taskNode(id, options), record, options);
  await putGun(queueNode(options).get('latest').get(id), {
    id,
    status: record.status,
    task: record.task,
    tenantId: record.tenantId,
    tenantAlias: record.tenantAlias,
    tenantPlan: record.tenantPlan,
    riskClass: record.riskClass,
    approvalStatus: record.approvalStatus,
    requiredCapabilities: record.requiredCapabilities,
    updatedAt: record.updatedAt,
  }, options);
  return record;
}

function listTasks(options = {}) {
  const node = queueNode(options).get('latest');
  const timeoutMs = options.timeoutMs || 2500;
  return new Promise((resolve) => {
    const rows = new Map();
    const timer = setTimeout(() => {
      resolve([...rows.values()].sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))));
    }, timeoutMs);
    node.map().once((data, key) => {
      if (data && data.id) {
        rows.set(key, data);
      }
    });
    if (options.rootNode) {
      clearTimeout(timer);
      resolve([...rows.values()].sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))));
    }
  });
}

function readTask(id, options = {}) {
  return new Promise((resolve) => {
    taskNode(id, options).once((data) => resolve(data || null));
  });
}

async function updateTask(id, patch = {}, options = {}) {
  const current = await readTask(id, options);
  if (!current) return null;
  const updated = normalizeTaskRecord({
    ...current,
    ...patch,
    id,
    updatedAt: patch.updatedAt || nowIso(options.now || Date.now()),
  });
  await putGun(taskNode(id, options), updated, options);
  await putGun(queueNode(options).get('latest').get(id), {
    id,
    status: updated.status,
    task: updated.task,
    tenantId: updated.tenantId,
    tenantAlias: updated.tenantAlias,
    tenantPlan: updated.tenantPlan,
    riskClass: updated.riskClass,
    approvalStatus: updated.approvalStatus,
    requiredCapabilities: updated.requiredCapabilities,
    updatedAt: updated.updatedAt,
  }, options);
  return updated;
}

function buildTaskArgs(record = {}, workerOptions = {}) {
  const args = ['--backend', record.backend || workerOptions.backend || DEFAULT_BACKEND, '--execute', '--no-print-prompt'];
  if (record.repo || workerOptions.repo) args.push('--repo', record.repo || workerOptions.repo);
  if (record.model || workerOptions.model) args.push('--model', record.model || workerOptions.model);
  if (record.thinking || workerOptions.thinking) args.push('--thinking', record.thinking || workerOptions.thinking);
  if (record.unsafe || workerOptions.unsafe) args.push('--unsafe');
  args.push(record.task);
  return args;
}

function workerProfile(options = {}) {
  return {
    workerId: deviceId(options),
    capabilities: csvToList(options.workerCapabilities || options.capabilities || DEFAULT_WORKER_CAPABILITIES),
    riskClasses: csvToList(options.workerRiskClasses || options.riskClasses || DEFAULT_WORKER_RISK_CLASSES),
    maxConcurrency: parseInteger(options.maxConcurrency, 1),
    backend: options.backend || DEFAULT_BACKEND,
  };
}

function canWorkerRunTask(record = {}, options = {}) {
  const profile = workerProfile(options);
  const required = csvToList(record.requiredCapabilities || record.backend || DEFAULT_BACKEND);
  const missingCapabilities = required.filter(capability => !profile.capabilities.includes(capability));
  if (missingCapabilities.length) {
    return {
      ok: false,
      reason: `missing capabilities: ${missingCapabilities.join(',')}`,
      profile,
    };
  }

  const riskClass = normalizeRiskClass(record.riskClass);
  if (!profile.riskClasses.includes(riskClass)) {
    return {
      ok: false,
      reason: `risk class not allowed: ${riskClass}`,
      profile,
    };
  }

  if (record.approvalStatus === 'required') {
    return {
      ok: false,
      reason: `approval required for ${riskClass}`,
      profile,
    };
  }

  return { ok: true, profile };
}

async function runQueuedTask(record, options = {}) {
  const runnable = canWorkerRunTask(record, options);
  if (!runnable.ok) {
    return { ok: false, skipped: true, reason: runnable.reason };
  }

  const lease = await claimLease(`remote-task:${record.id}`, {
    ...options,
    ttlMs: options.leaseTtlMs || DEFAULT_LEASE_TTL_MS,
  });
  if (!lease.acquired) {
    return { ok: false, skipped: true, reason: `held by ${lease.ownerDeviceId || 'another worker'}` };
  }

  await updateTask(record.id, {
    status: 'running',
    workerDeviceId: lease.lease?.deviceId || '',
    workerCapabilities: normalizeCsv(runnable.profile.capabilities),
    startedAt: nowIso(),
  }, options);

  try {
    const runAgentTaskImpl = options.runAgentTaskImpl || require('./task-orchestrator').runAgentTask;
    const result = await runAgentTaskImpl(buildTaskArgs(record, options), options.hooks || {});
    const summary = summarizeTaskResult(result);
    await updateTask(record.id, {
      status: result.ok ? 'completed' : result.skipped ? 'skipped' : 'failed',
      completedAt: nowIso(),
      resultSummary: summary,
      error: result.ok ? '' : summary,
    }, options);
    return result;
  } catch (error) {
    const message = error.message || String(error);
    await updateTask(record.id, {
      status: 'failed',
      completedAt: nowIso(),
      error: message,
      resultSummary: message,
    }, options);
    return { ok: false, error: message };
  } finally {
    await releaseLease(`remote-task:${record.id}`, lease.lease?.token, options).catch(() => {});
  }
}

function summarizeTaskResult(result = {}) {
  if (result.reason) return result.reason;
  if (result.result?.stdout) return String(result.result.stdout).slice(0, 2000);
  if (result.result?.stderr) return String(result.result.stderr).slice(0, 2000);
  if (result.backend) return `backend=${result.backend} ok=${Boolean(result.ok)}`;
  return JSON.stringify(result).slice(0, 2000);
}

async function runWorkerOnce(options = {}) {
  const profile = workerProfile(options);
  await writeHeartbeat('task-worker', {
    ...options,
    status: 'running',
    capabilities: profile.capabilities,
    maxConcurrency: profile.maxConcurrency,
    metadata: {
      limit: options.limit || DEFAULT_TASK_LIMIT,
      backend: options.backend || DEFAULT_BACKEND,
      capabilities: profile.capabilities,
      riskClasses: profile.riskClasses,
      maxConcurrency: profile.maxConcurrency,
    },
  }).catch(() => {});
  const tasks = await listTasks(options);
  const queued = tasks
    .filter(task => task.status === 'queued')
    .filter(task => canWorkerRunTask(task, options).ok)
    .slice(0, options.limit || DEFAULT_TASK_LIMIT);
  const results = [];
  for (const summary of queued) {
    const record = await readTask(summary.id, options);
    if (!record || record.status !== 'queued') continue;
    results.push({ id: record.id, result: await runQueuedTask(record, options) });
  }
  return results;
}

async function sleep(ms) {
  await new Promise(resolve => setTimeout(resolve, ms));
}

async function runWorkerLoop(options = {}) {
  for (;;) {
    const results = await runWorkerOnce(options);
    if (results.length) {
      console.log(`[agent-worker] processed ${results.length} task(s)`);
    }
    await sleep((options.intervalSeconds || DEFAULT_WORKER_INTERVAL_SECONDS) * 1000);
  }
}

function parseArgs(argv = process.argv.slice(2)) {
  const command = argv[0] || 'help';
  const options = {
    command,
    backend: DEFAULT_BACKEND,
    task: '',
    id: '',
    unsafe: false,
    json: false,
    intervalSeconds: DEFAULT_WORKER_INTERVAL_SECONDS,
    limit: DEFAULT_TASK_LIMIT,
  };
  const positional = [];
  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--backend') options.backend = argv[++index] || DEFAULT_BACKEND;
    else if (arg === '--repo') options.repo = argv[++index] || '';
    else if (arg === '--model') options.model = argv[++index] || '';
    else if (arg === '--thinking') options.thinking = argv[++index] || '';
    else if (arg === '--id') options.id = argv[++index] || '';
    else if (arg === '--tenant-id') options.tenantId = argv[++index] || '';
    else if (arg === '--tenant-alias') options.tenantAlias = argv[++index] || '';
    else if (arg === '--tenant-plan') options.tenantPlan = argv[++index] || '';
    else if (arg === '--risk') options.riskClass = argv[++index] || '';
    else if (arg === '--approval-status') options.approvalStatus = argv[++index] || '';
    else if (arg === '--requires') options.requiredCapabilities = argv[++index] || '';
    else if (arg === '--max-runtime-ms') options.maxRuntimeMs = parseInteger(argv[++index], 0);
    else if (arg === '--worker-capabilities') options.workerCapabilities = argv[++index] || '';
    else if (arg === '--worker-risk-classes') options.workerRiskClasses = argv[++index] || '';
    else if (arg === '--limit') options.limit = parseInteger(argv[++index], DEFAULT_TASK_LIMIT);
    else if (arg === '--unsafe') options.unsafe = true;
    else if (arg === '--json') options.json = true;
    else if (arg === '--interval-seconds') options.intervalSeconds = parseInteger(argv[++index], DEFAULT_WORKER_INTERVAL_SECONDS);
    else positional.push(arg);
  }
  options.task = positional.join(' ');
  return options;
}

async function cli(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.command === 'enqueue') {
    const record = await enqueueTask(options.task, options);
    console.log(options.json ? JSON.stringify(record, null, 2) : `Queued ${record.id}: ${record.task}`);
    return;
  }
  if (options.command === 'list') {
    const tasks = await listTasks(options);
    if (options.json) console.log(JSON.stringify(tasks, null, 2));
    else tasks.forEach(task => console.log(`${task.updatedAt || ''} ${task.status || ''} ${task.id || ''} ${task.task || ''}`));
    return;
  }
  if (options.command === 'status' || options.command === 'result') {
    const record = await readTask(options.id || options.task, options);
    console.log(options.json ? JSON.stringify(record || {}, null, 2) : formatTask(record));
    return;
  }
  if (options.command === 'run-once') {
    const results = await runWorkerOnce(options);
    console.log(options.json ? JSON.stringify(results, null, 2) : `Processed ${results.length} task(s).`);
    return;
  }
  if (options.command === 'loop') {
    await runWorkerLoop(options);
    return;
  }
  console.log('Usage: ask-agent-queue enqueue|list|status|result|run-once|loop [options] "task"');
}

function formatTask(record) {
  if (!record) return 'Task not found.';
  return [
    `Task: ${record.id}`,
    `Status: ${record.status}`,
    `Tenant: ${record.tenantId}${record.tenantAlias && record.tenantAlias !== record.tenantId ? ` (${record.tenantAlias})` : ''}`,
    `Backend: ${record.backend}`,
    `Risk: ${record.riskClass}`,
    `Approval: ${record.approvalStatus}`,
    `Requires: ${record.requiredCapabilities}`,
    `Task: ${record.task}`,
    record.resultSummary ? `Result: ${record.resultSummary}` : '',
    record.error ? `Error: ${record.error}` : '',
  ].filter(Boolean).join('\n');
}

module.exports = {
  buildTaskArgs,
  canWorkerRunTask,
  csvToList,
  enqueueTask,
  formatTask,
  listTasks,
  normalizeTaskRecord,
  normalizeTenantRecord,
  parseArgs,
  readTask,
  runQueuedTask,
  runWorkerLoop,
  runWorkerOnce,
  summarizeTaskResult,
  updateTask,
  workerProfile,
};

if (require.main === module) {
  cli().then(() => {
    if ((process.argv[2] || 'help') !== 'loop') {
      process.exit(0);
    }
  }).catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}

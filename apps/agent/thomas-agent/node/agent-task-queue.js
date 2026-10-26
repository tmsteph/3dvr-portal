const crypto = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
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
const DEFAULT_QUEUE_STORE = process.env.THREEDVR_AGENT_QUEUE_STORE || 'gun';
const DEFAULT_WORKER_INTERVAL_SECONDS = parseInteger(process.env.THREEDVR_AGENT_WORKER_INTERVAL_SECONDS, 20);
const DEFAULT_TASK_LIMIT = parseInteger(process.env.THREEDVR_AGENT_WORKER_LIMIT, 10);
const DEFAULT_LEASE_TTL_MS = parseInteger(process.env.THREEDVR_AGENT_WORKER_LEASE_TTL_MS, 30 * 60 * 1000);
const MIN_ACTIVE_SQLITE_CLAIM_TTL_MS = 1000;
const DEFAULT_TENANT_PLAN = process.env.THREEDVR_AGENT_TENANT_PLAN || 'free';
const DEFAULT_ENQUEUE_FLUSH_MS = parseInteger(process.env.THREEDVR_AGENT_ENQUEUE_FLUSH_MS, 3000);
const DEFAULT_WORKER_CAPABILITIES = process.env.THREEDVR_AGENT_WORKER_CAPABILITIES || 'node,auto,codex,openai,claude,openclaw,shell';
const DEFAULT_WORKER_RISK_CLASSES = process.env.THREEDVR_AGENT_WORKER_RISK_CLASSES || 'read_only,draft,workspace_write';
const VALID_RISK_CLASSES = new Set(['read_only', 'draft', 'workspace_write', 'external_write', 'money', 'credential']);
const APPROVAL_REQUIRED_RISKS = new Set(['external_write', 'money', 'credential']);
const INTRINSIC_BACKENDS = new Set(['health']);

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeText(value) {
  return String(value || '').trim();
}

function queueStore(options = {}) {
  return normalizeText(options.queueStore || DEFAULT_QUEUE_STORE).toLowerCase() === 'sqlite' ? 'sqlite' : 'gun';
}

function sqliteQueue() {
  return require('./task-queue-sqlite-store');
}

function gunSyncEnabled(options = {}) {
  const value = options.gunSync === undefined
    ? process.env.THREEDVR_AGENT_QUEUE_GUN_SYNC
    : options.gunSync;
  if (value === undefined || value === null || value === '') return true;
  return !/^(0|false|no|off)$/i.test(String(value).trim());
}

function enqueueFlushMs(options = {}) {
  if (options.rootNode || queueStore(options) === 'sqlite') return 0;
  if (options.enqueueFlushMs === undefined) return DEFAULT_ENQUEUE_FLUSH_MS;
  const parsed = Number.parseInt(String(options.enqueueFlushMs), 10);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : DEFAULT_ENQUEUE_FLUSH_MS;
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
  const risk = normalizeText(value).toLowerCase();
  // Missing risk preserves the historical draft default. An explicitly
  // unknown risk must never silently downgrade to draft and bypass approval.
  if (!risk) return 'draft';
  return VALID_RISK_CLASSES.has(risk) ? risk : 'external_write';
}

function defaultApprovalStatus(record = {}) {
  if (normalizeText(record.approvalStatus)) return normalizeText(record.approvalStatus);
  // --unsafe requests broader execution privileges; it is not proof of a
  // human approval. Keep such work blocked until explicitly reviewed.
  return (record.unsafe || APPROVAL_REQUIRED_RISKS.has(normalizeRiskClass(record.riskClass)))
    ? 'required' : 'not_required';
}

function normalizeTenantRecord(record = {}) {
  const tenantId = normalizeText(record.tenantId) || normalizeText(record.ownerAlias) || DEFAULT_OWNER_ALIAS;
  return {
    tenantId,
    tenantAlias: normalizeText(record.tenantAlias) || normalizeText(record.requestedBy) || tenantId,
    tenantPlan: normalizeText(record.tenantPlan) || DEFAULT_TENANT_PLAN,
  };
}

function taskSummary(record = {}) {
  return {
    id: record.id,
    status: record.status,
    task: record.task,
    tenantId: record.tenantId,
    tenantAlias: record.tenantAlias,
    tenantPlan: record.tenantPlan,
    riskClass: record.riskClass,
    approvalStatus: record.approvalStatus,
    requiredCapabilities: record.requiredCapabilities,
    updatedAt: record.updatedAt,
  };
}

function normalizeTaskRecord(record = {}) {
  const tenant = normalizeTenantRecord(record);
  const riskClass = normalizeRiskClass(record.riskClass);
  const backend = normalizeText(record.backend) || DEFAULT_BACKEND;
  const defaultRequirement = INTRINSIC_BACKENDS.has(backend.toLowerCase()) ? '' : backend;
  return {
    id: normalizeText(record.id),
    task: normalizeText(record.task),
    tenantId: tenant.tenantId,
    tenantAlias: tenant.tenantAlias,
    tenantPlan: tenant.tenantPlan,
    backend,
    repo: normalizeText(record.repo),
    model: normalizeText(record.model),
    thinking: normalizeText(record.thinking),
    unsafe: Boolean(record.unsafe),
    riskClass,
    approvalStatus: defaultApprovalStatus({ ...record, riskClass }),
    requiredCapabilities: normalizeCsv(record.requiredCapabilities || record.requires || defaultRequirement),
    maxRuntimeMs: parseInteger(record.maxRuntimeMs, 0),
    status: normalizeText(record.status) || 'queued',
    createdAt: normalizeText(record.createdAt) || nowIso(),
    updatedAt: normalizeText(record.updatedAt) || nowIso(),
    // Keep the worker claim and terminal timestamps when normalizing a
    // receipt; dropping startedAt also breaks immutable-claim validation.
    startedAt: normalizeText(record.startedAt),
    completedAt: normalizeText(record.completedAt),
    requestedBy: normalizeText(record.requestedBy) || 'cli',
    resultSummary: normalizeText(record.resultSummary),
    ...(String(record.id || '').startsWith('operator-http-') ? {
      resultText: String(record.resultText || '').slice(0, 24000),
      resultSummaryTruncated: record.resultSummaryTruncated === true,
      resultTruncated: record.resultTruncated === true,
    } : {}),
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
  const summary = taskSummary(record);
  if (queueStore(options) === 'sqlite') {
    sqliteQueue().insertTask(record, options);
    return record;
  }
  await putGun(taskNode(id, options), record, options);
  await putGun(queueNode(options).get('latest').get(id), summary, options);
  return record;
}

function listTasks(options = {}) {
  if (queueStore(options) === 'sqlite') return sqliteQueue().listTasks(options);
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
  if (queueStore(options) === 'sqlite') return sqliteQueue().readTask(id, options);
  return new Promise((resolve, reject) => {
    // Relay silence is not a missing record: rejecting preserves remote state
    // and prevents a compatibility poll from waiting forever before execution.
    const timer = setTimeout(() => reject(new Error('Task relay read timed out.')), options.timeoutMs || 2500);
    try {
      taskNode(id, options).once((data) => {
        clearTimeout(timer);
        resolve(data || null);
      });
    } catch (error) {
      clearTimeout(timer);
      reject(error);
    }
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
  const summary = taskSummary(updated);
  if (queueStore(options) === 'sqlite') {
    sqliteQueue().writeTask(updated, options);
    return updated;
  }
  await putGun(taskNode(id, options), updated, options);
  await putGun(queueNode(options).get('latest').get(id), summary, options);
  return updated;
}

function buildTaskArgs(record = {}, workerOptions = {}) {
  const args = ['--backend', record.backend || workerOptions.backend || DEFAULT_BACKEND, '--execute', '--no-print-prompt'];
  if (record.repo || workerOptions.repo) args.push('--repo', record.repo || workerOptions.repo);
  if (record.model || workerOptions.model) args.push('--model', record.model || workerOptions.model);
  if (record.thinking || workerOptions.thinking) args.push('--thinking', record.thinking || workerOptions.thinking);
  const maxRuntimeMs = parseInteger(record.maxRuntimeMs || workerOptions.maxRuntimeMs, 0);
  if (maxRuntimeMs > 0) args.push('--timeout-ms', String(maxRuntimeMs));
  // A worker-wide unsafe flag must not silently upgrade every queued task.
  if (record.unsafe) args.push('--unsafe');
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

function requiredWorkerCapabilities(record = {}) {
  const backend = normalizeText(record.backend || DEFAULT_BACKEND).toLowerCase();
  const required = new Set(csvToList(record.requiredCapabilities || record.requires));
  if (!INTRINSIC_BACKENDS.has(backend) && backend && backend !== 'auto') {
    required.add(backend);
  }
  return [...required];
}

// GUN has no atomic compare-and-swap for task records. At minimum, reject
// stale worker snapshots after acquiring the coordination lease; SQLite's
// transactional claim remains the required path for strong authorization.
function sameExecutionIntent(before = {}, after = {}) {
  const fields = [
    'id', 'task', 'tenantId', 'tenantAlias', 'tenantPlan', 'backend',
    'repo', 'model', 'thinking', 'unsafe', 'riskClass', 'approvalStatus',
    'requiredCapabilities', 'maxRuntimeMs', 'requestedBy',
  ];
  // GUN/JSON round-trips recreate arrays; compare immutable intent by value.
  // A genuinely changed capability list must still reject the stale snapshot.
  return fields.every(field => isDeepStrictEqual(before[field], after[field]));
}

function canWorkerRunTask(record = {}, options = {}) {
  const profile = workerProfile(options);
  const required = requiredWorkerCapabilities(record);
  const missingCapabilities = required.filter(capability => !profile.capabilities.includes(capability));
  if (missingCapabilities.length) {
    return {
      ok: false,
      reason: `missing capabilities: ${missingCapabilities.join(',')}`,
      profile,
    };
  }

  const declaredRiskClass = normalizeRiskClass(record.riskClass);
  // Unsafe execution is at least an external write, even if the producer
  // mislabeled it as a draft/read-only task or the worker was started unsafe.
  const riskClass = record.unsafe || options.unsafe
    ? (APPROVAL_REQUIRED_RISKS.has(declaredRiskClass) ? declaredRiskClass : 'external_write')
    : declaredRiskClass;
  if (!profile.riskClasses.includes(riskClass)) {
    return {
      ok: false,
      reason: `risk class not allowed: ${riskClass}`,
      profile,
    };
  }

  const approvalStatus = normalizeText(record.approvalStatus).toLowerCase();
  // Imported and historical records can contain denied, pending, expired, or
  // missing approval states. Never treat those as implicit authorization.
  if ((approvalStatus && !['approved', 'not_required'].includes(approvalStatus))
    || (APPROVAL_REQUIRED_RISKS.has(riskClass) && approvalStatus !== 'approved')) {
    return {
      ok: false,
      reason: `approval required for ${riskClass}`,
      profile,
    };
  }

  // A plain "approved" string is supplied by the task producer and is not
  // an authenticated, message/task-bound human approval receipt. Until the
  // approval verifier exists, high-risk work must remain blocked even if a
  // producer (or imported record) labels it approved. Do not invent a
  // worker-local override: that would recreate the same bypass.
  if (APPROVAL_REQUIRED_RISKS.has(riskClass)) {
    return {
      ok: false,
      reason: `authenticated human approval verification unavailable for ${riskClass}`,
      profile,
    };
  }

  return { ok: true, profile };
}

async function recordTaskLifeEvent(record, options = {}) {
  if (!record || !['completed', 'failed'].includes(record.status)) return null;
  if (normalizeText(record.backend).toLowerCase() === 'health' || record.id?.startsWith('operator-http-')) return null;
  const recordLifeEventImpl = options.recordLifeEventImpl || require('./digital-organism').recordLifeEvent;
  const tags = ['builder', 'agent-task', normalizeText(record.backend).toLowerCase()]
    .filter(Boolean);
  if (record.repo) tags.push('code');
  try {
    return await recordLifeEventImpl(`Agent task ${record.status}: ${record.task}`, {
      kind: `task.${record.status}`,
      actor: 'agent',
      tags,
      sourceType: 'agent-task',
      sourceId: record.id,
      occurredAt: record.completedAt || record.updatedAt,
    });
  } catch {
    return null;
  }
}

async function runQueuedTask(record, options = {}) {
  // Signed Operator HTTP tasks are admitted only by the authenticated private
  // SQLite queue. Public GUN records must never impersonate that namespace.
  if (queueStore(options) !== 'sqlite' && record.id?.startsWith('operator-http-')) {
    return { ok: false, skipped: true, reason: 'signed Operator task requires private SQLite admission' };
  }
  const runnable = canWorkerRunTask(record, options);
  if (!runnable.ok) {
    return { ok: false, skipped: true, reason: runnable.reason };
  }

  let lease;
  let claimed = record;
  if (queueStore(options) === 'sqlite') {
    const now = options.now || Date.now();
    const claimToken = crypto.randomUUID();
    claimed = sqliteQueue().claimTask(
      record.id,
      claimToken,
      runnable.profile.workerId,
      now + (options.leaseTtlMs || DEFAULT_LEASE_TTL_MS),
      now,
      {
        ...options,
        // A queue snapshot can become stale between readTask and claimTask.
        // Validate the latest SQLite row within its atomic claim transaction.
        authorizeTask: current => canWorkerRunTask(current, options).ok,
      },
    );
    if (!claimed) return { ok: false, skipped: true, reason: 'claim unavailable or task no longer authorized' };
    claimed.workerCapabilities = normalizeCsv(runnable.profile.capabilities);
  } else {
    lease = await claimLease(`remote-task:${record.id}`, {
      ...options,
      ttlMs: options.leaseTtlMs || DEFAULT_LEASE_TTL_MS,
    });
    if (!lease.acquired) {
      return { ok: false, skipped: true, reason: `held by ${lease.ownerDeviceId || 'another worker'}` };
    }
    // The task can be edited or revoked after the worker's first read.
    // Never execute the old snapshot if its intent or authorization changed.
    try {
      const current = await readTask(record.id, options);
      if (!current || current.status !== 'queued'
        || !sameExecutionIntent(record, current)
        || !canWorkerRunTask(current, options).ok) {
        await releaseLease(`remote-task:${record.id}`, lease.lease?.token, options).catch(() => {});
        return { ok: false, skipped: true, reason: 'GUN task changed or is no longer authorized' };
      }
      claimed = await updateTask(record.id, {
        status: 'running',
        workerDeviceId: lease.lease?.deviceId || '',
        workerCapabilities: normalizeCsv(runnable.profile.capabilities),
        startedAt: nowIso(),
      }, options);
      if (!claimed) {
        await releaseLease(`remote-task:${record.id}`, lease.lease?.token, options).catch(() => {});
        return { ok: false, skipped: true, reason: 'GUN task disappeared during claim' };
      }
    } catch (error) {
      // A failed GUN read/write must not leave our lease held until TTL.
      await releaseLease(`remote-task:${record.id}`, lease.lease?.token, options).catch(() => {});
      throw error;
    }
  }

  let renewalTimer;
  let claimRenewer;
  if (claimed.claimToken) {
    // A claim can succeed while opening the persistent renewal handle fails
    // (for example, SQLite initialization or a transient lock). Do not run
    // the backend or abort the worker batch: preserve this running claim for
    // explicit review, while allowing unrelated queued work to continue.
    try {
      claimRenewer = sqliteQueue().createClaimRenewer(claimed.id, claimed.claimToken, options);
    } catch {
      return {
        ok: false,
        skipped: true,
        reason: 'SQLite claim renewer unavailable before execution; task held for review',
      };
    }
    const ttlMs = options.leaseTtlMs || DEFAULT_LEASE_TTL_MS;
    // Very short test/custom leases are vulnerable to ordinary event-loop stalls.
    // Once work has actually started, keep at least one second of claim headroom;
    // the production default is already much larger and is unchanged.
    const activeTtlMs = Math.max(ttlMs, MIN_ACTIVE_SQLITE_CLAIM_TTL_MS);
    // If the initial lease refresh is rejected or its outcome is uncertain,
    // never begin execution: the claim may already have expired. Keep the
    // running row for explicit reconciliation instead of replaying side effects.
    let initialRenewalOk = false;
    try {
      initialRenewalOk = claimRenewer.renew(Date.now() + activeTtlMs);
    } catch {
      // An uncertain renewal is not permission to execute.
    }
    if (!initialRenewalOk) {
      claimRenewer.close();
      return {
        ok: false,
        skipped: true,
        reason: 'SQLite claim renewal failed before execution; task held for review',
      };
    }
    renewalTimer = setInterval(() => {
      try {
        claimRenewer.renew(Date.now() + activeTtlMs);
      } catch {
        // A later heartbeat or the token-checked terminal write can recover;
        // never let a transient renewal error crash the worker process.
      }
    }, Math.max(1, Math.floor(ttlMs / 3)));
    renewalTimer.unref?.();
  }
  try {
    let result;
    if (normalizeText(claimed.backend).toLowerCase() === 'health') {
      result = {
        ok: true,
        backend: 'health',
        result: { stdout: '3dvr-worker-ok' },
      };
    } else if (claimed.id?.startsWith('operator-http-') && !options.runAgentTaskImpl) {
      result = await require('./operator-codex-task').runOperatorCodexTask(claimed);
    } else {
      const runAgentTaskImpl = options.runAgentTaskImpl || require('./task-orchestrator').runAgentTask;
      result = await runAgentTaskImpl(buildTaskArgs(claimed, options), options.hooks || {});
    }
    const summary = summarizeTaskResult(result);
    const terminal = await finishClaimedTask(claimed, {
      status: result.ok ? 'completed' : result.skipped ? 'skipped' : 'failed',
      completedAt: nowIso(),
      resultSummary: summary,
      ...(queueStore(options) === 'sqlite' ? privateTaskResult(claimed, result) : {}),
      error: result.ok ? '' : summary,
    }, options);
    await recordTaskLifeEvent(terminal, options);
    return result;
  } catch (error) {
    const message = error.message || String(error);
    // A task may finish executing after its SQLite lease expires. The first
    // terminal write then fails closed. Do not attempt a second terminal write
    // with the same lost claim: it will fail again and abort the whole worker
    // batch, starving unrelated queued work. Side effects may already exist,
    // so preserve the running row for explicit reconciliation, not replay.
    if (queueStore(options) === 'sqlite'
      && message === `Lost SQLite claim for task ${claimed.id}.`) {
      return {
        ok: false,
        skipped: true,
        reason: 'SQLite claim lost; execution outcome unverified and task held for review',
      };
    }
    let terminal;
    try {
      terminal = await finishClaimedTask(claimed, {
        status: 'failed',
        completedAt: nowIso(),
        error: message,
        resultSummary: message,
        ...(queueStore(options) === 'sqlite' ? privateTaskResult(claimed, { reason: message }) : {}),
      }, options);
    } catch (finishError) {
      // Backend failures can also outlive the lease. Do not let their
      // unrecordable failure receipt crash the batch or replay side effects.
      if (queueStore(options) === 'sqlite'
        && finishError.message === `Lost SQLite claim for task ${claimed.id}.`) {
        return {
          ok: false,
          skipped: true,
          reason: 'SQLite claim lost; execution outcome unverified and task held for review',
        };
      }
      throw finishError;
    }
    await recordTaskLifeEvent(terminal, options);
    return { ok: false, error: message };
  } finally {
    if (renewalTimer) clearInterval(renewalTimer);
    claimRenewer?.close();
    if (lease) await releaseLease(`remote-task:${record.id}`, lease.lease?.token, options).catch(() => {});
  }
}

async function updateGunTask(id, record, options = {}) {
  const gunOptions = { ...options, queueStore: 'gun' };
  const { claimExpiresAt, claimToken, queueSource, ...publicRecord } = record;
  await putGun(taskNode(id, gunOptions), publicRecord, gunOptions);
  await putGun(queueNode(gunOptions).get('latest').get(id), taskSummary(publicRecord), gunOptions);
}

async function finishClaimedTask(claimed, patch, options = {}) {
  if (queueStore(options) !== 'sqlite') return updateTask(claimed.id, patch, options);
  const updated = normalizeTaskRecord({
    ...claimed,
    ...patch,
    id: claimed.id,
    updatedAt: patch.updatedAt || nowIso(options.now || Date.now()),
  });
  const finished = sqliteQueue().finishTask(claimed.id, claimed.claimToken, updated, options);
  if (!finished) throw new Error(`Lost SQLite claim for task ${claimed.id}.`);
  await mirrorTerminalTask(updated, options).catch(() => {});
  return updated;
}

function timestamp(record = {}) {
  const value = Date.parse(record.updatedAt || '');
  return Number.isFinite(value) ? value : 0;
}

async function mirrorTerminalTask(record, options = {}) {
  // Signed HTTP tasks and replies stay in the private server queue.
  if (record.id?.startsWith('operator-http-')) return false;
  if (!gunSyncEnabled(options)) return false;
  if (!['completed', 'failed', 'skipped'].includes(record.status)) return false;
  const remote = await readTask(record.id, { ...options, queueStore: 'gun' });
  if (remote && timestamp(remote) > timestamp(record)) return false;
  await updateGunTask(record.id, record, options);
  return true;
}

async function syncTerminalResults(options = {}) {
  if (queueStore(options) !== 'sqlite' || !gunSyncEnabled(options)) return;
  const records = sqliteQueue().listTasks(options);
  for (const record of records) {
    await mirrorTerminalTask(record, options).catch(() => {});
  }
}

async function importLegacyGunTasks(options = {}) {
  if (queueStore(options) !== 'sqlite' || !gunSyncEnabled(options)) return;
  const gunOptions = { ...options, queueStore: 'gun' };
  const summaries = await listTasks(gunOptions);
  for (const summary of summaries) {
    // The HTTP namespace is server-owned; public relay data cannot replace it.
    if (summary.id?.startsWith('operator-http-')) continue;
    // Terminal GUN mirrors are unverified: quarantine any matching, still-
    // queued imported SQLite row rather than replaying or trusting a receipt.
    // The SQLite import never inserts an unseen terminal record.
    if (!['queued', 'completed', 'failed', 'skipped', 'cancelled'].includes(summary.status)) continue;
    const record = await readTask(summary.id, gunOptions);
    if (record && record.status === summary.status) {
      sqliteQueue().importTask(normalizeTaskRecord(record), options);
    }
  }
}

function taskResultText(result = {}) {
  if (result.reason) return String(result.reason);
  if (result.result?.stdout) return String(result.result.stdout);
  if (result.result?.stderr) return String(result.result.stderr);
  if (result.backend) return `backend=${result.backend} ok=${Boolean(result.ok)}`;
  return JSON.stringify(result);
}

function privateTaskResult(record, result) {
  if (!record.id?.startsWith('operator-http-')) return {};
  const text = taskResultText(result);
  return {
    resultText: text.slice(0, 24000),
    resultSummaryTruncated: text.length > 2000,
    resultTruncated: text.length > 24000,
  };
}

function summarizeTaskResult(result = {}) {
  return taskResultText(result).slice(0, 2000);
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
      capabilities: normalizeCsv(profile.capabilities),
      riskClasses: normalizeCsv(profile.riskClasses),
      maxConcurrency: profile.maxConcurrency,
    },
  }).catch(() => {});
  await syncTerminalResults(options);
  await importLegacyGunTasks(options);
  const tasks = await listTasks(options);
  // An expired running lease is not proof the task is safe to execute twice.
  const queued = tasks
    .filter(task => task.status === 'queued')
    // The signed HTTP namespace is never executable from the public GUN lane.
    .filter(task => queueStore(options) === 'sqlite' || !task.id?.startsWith('operator-http-'))
    // Public GUN imports are visible for reconciliation, not executable
    // admissions. Exclude them before applying the worker batch limit.
    .filter(task => queueStore(options) !== 'sqlite' || task.queueSource === 'sqlite')
    .filter(task => canWorkerRunTask(task, options).ok)
    .slice(0, options.limit || DEFAULT_TASK_LIMIT);
  const results = [];
  for (const summary of queued) {
    try {
      const record = await readTask(summary.id, options);
      if (!record || record.status !== 'queued') continue;
      results.push({ id: record.id, result: await runQueuedTask(record, options) });
    } catch (error) {
      // A read, claim, or receipt exception is not evidence that the task
      // failed or that its side effects did not happen. Do not fabricate a
      // terminal receipt or retry it here. Keep the persisted state intact,
      // report an unverified outcome, and let independent work continue.
      results.push({
        id: summary.id,
        result: {
          ok: false,
          skipped: true,
          requiresReview: true,
          reason: 'Worker task outcome unverified; inspect durable state before retry',
          errorType: String(error?.name || 'Error'),
        },
      });
    }
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
    queueStore: DEFAULT_QUEUE_STORE,
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
    else if (arg === '--queue-store') options.queueStore = argv[++index] || DEFAULT_QUEUE_STORE;
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
    else if (arg === '--enqueue-flush-ms') options.enqueueFlushMs = parseInteger(argv[++index], DEFAULT_ENQUEUE_FLUSH_MS);
    else positional.push(arg);
  }
  options.task = positional.join(' ');
  return options;
}

async function cli(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.command === 'enqueue') {
    const record = await enqueueTask(options.task, options);
    console.log(options.json ? JSON.stringify(publicTask(record), null, 2) : `Queued ${record.id}: ${record.task}`);
    const flushMs = enqueueFlushMs(options);
    if (flushMs > 0) await new Promise(resolve => setTimeout(resolve, flushMs));
    return;
  }
  if (options.command === 'list') {
    const tasks = await listTasks(options);
    if (options.json) console.log(JSON.stringify(tasks.map(publicTask), null, 2));
    else tasks.forEach(task => console.log(`${task.updatedAt || ''} ${task.status || ''} ${task.id || ''} ${task.task || ''}`));
    return;
  }
  if (options.command === 'status' || options.command === 'result') {
    const record = await readTask(options.id || options.task, options);
    console.log(options.json ? JSON.stringify(publicTask(record), null, 2) : formatTask(record));
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

function publicTask(record) {
  if (!record) return {};
  const { claimExpiresAt, claimToken, queueSource, ...publicRecord } = record;
  return publicRecord;
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
  enqueueFlushMs,
  gunSyncEnabled,
  queueStore,
  formatTask,
  listTasks,
  normalizeTaskRecord,
  normalizeTenantRecord,
  parseArgs,
  publicTask,
  readTask,
  recordTaskLifeEvent,
  requiredWorkerCapabilities,
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

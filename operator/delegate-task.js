import { createSignedPortalProof } from './forge.js';
import { createWorkItem } from '../src/operator-runtime/work-item.js';
import { workItemToAgentQueueRecord, workItemToQueueSummary } from '../src/operator-runtime/task-queue-adapter.js';
import { workItemToRuntimeSidecar } from '../src/operator-runtime/runtime-sidecar.js';

const ROOT_KEY = '3dvr-portal';
const MANAGED_AGENT_OWNER_ALIAS = '3dvr-managed';
const DEFAULT_PEERS = [
  'wss://relay.3dvr.tech/gun',
  'wss://gun-relay-3dvr.fly.dev/gun'
];
const TASK_WATCH_TIMEOUT_MS = 5 * 60 * 1000;
const TERMINAL_TASK_STATUSES = new Set(['completed', 'failed', 'skipped', 'cancelled', 'canceled', 'blocked', 'review', 'status_unavailable']);

function normalizeText(value = '', max = 4000) {
  return String(value || '').trim().slice(0, max);
}

function makeId(prefix) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

function taskStatus(record = {}) {
  return normalizeText(record.status, 80).toLowerCase() || 'queued';
}

function runtimeBudget(estimateMs = 120_000) {
  const minutes = Math.max(1, Math.ceil(Number(estimateMs || 120_000) / 60_000));
  return `runtime budget ≤${minutes}m`;
}

function elapsed(record = {}) {
  const started = Date.parse(record.startedAt || record.createdAt || '');
  if (!Number.isFinite(started)) return '';
  const seconds = Math.max(0, Math.floor((Date.now() - started) / 1000));
  return seconds >= 60 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${seconds}s`;
}

export function isOperatorTaskTerminal(record = {}) {
  return TERMINAL_TASK_STATUSES.has(taskStatus(record));
}

export function operatorTaskProgress(record = {}, estimateMs = 120_000) {
  const status = taskStatus(record);
  const age = elapsed(record);
  if (status === 'completed') return 'Complete';
  if (status === 'running') return `Working${age ? ` · ${age} elapsed` : ''} · ${runtimeBudget(estimateMs)}`;
  if (status === 'status_unavailable') return 'Status unavailable · server task outcome unknown';
  if (status === 'review') return 'Needs your input';
  if (status === 'blocked') return 'Blocked · needs attention';
  if (['failed', 'skipped', 'cancelled', 'canceled'].includes(status)) return `Stopped · ${status}`;
  return `Queued${age ? ` · ${age}` : ''} · ${runtimeBudget(estimateMs)}`;
}

export function operatorTaskReceipt(record = {}) {
  const status = taskStatus(record);
  const output = normalizeText(record.resultText || record.resultSummary || record.error, 24000);
  const summary = output && record.resultTruncated
    ? `${output}\n\n[Result exceeded the 24,000-character storage limit.]`
    : output;
  // A stopped browser poll is not a worker failure or a blocked queue task.
  if (status === 'status_unavailable') return 'Operator Runtime status could not be verified. The saved task may still be queued, running, or complete. Do not resubmit; check the same task ID.';
  if (status === 'completed') return summary ? `Operator Runtime finished. Result: ${summary}` : 'Operator Runtime finished.';
  if (status === 'review') return summary ? `Operator Runtime needs your input: ${summary}` : 'Operator Runtime needs your input.';
  if (status === 'blocked') return summary ? `Operator Runtime is blocked: ${summary}` : 'Operator Runtime is blocked.';
  if (['failed', 'skipped', 'cancelled', 'canceled'].includes(status)) {
    return summary ? `Operator Runtime stopped: ${summary}` : `Operator Runtime stopped: ${status}.`;
  }
  return operatorTaskProgress(record);
}

export function watchOperatorTask(taskId, options = {}) {
  const id = normalizeText(taskId, 240);
  if (id.startsWith('operator-http:')) return watchConfirmedTask(id.slice('operator-http:'.length), options);
  if (!id || typeof globalThis.Gun !== 'function') return () => {};
  const onUpdate = typeof options.onUpdate === 'function' ? options.onUpdate : () => {};
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : TASK_WATCH_TIMEOUT_MS;
  const gun = globalThis.Gun({ localStorage: false, peers: globalThis.__GUN_PEERS__ || DEFAULT_PEERS });
  const node = gun
    .get(ROOT_KEY)
    .get('agentOps')
    .get(MANAGED_AGENT_OWNER_ALIAS)
    .get('taskQueue')
    .get('tasks')
    .get(id);
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    globalThis.clearTimeout?.(timer);
    try { node.off(); } catch {}
  };
  const timer = globalThis.setTimeout?.(() => stop(), timeoutMs);
  node.on(record => {
    if (stopped || !record || typeof record !== 'object') return;
    onUpdate(record);
    if (isOperatorTaskTerminal(record)) stop();
  });
  return stop;
}

export function buildOperatorDelegatedTask(action = {}, options = {}) {
  const requestedTask = normalizeText(action.text, 6000);
  if (!requestedTask) throw new Error('A delegated task is required.');

  const id = normalizeText(options.id, 200) || makeId('operator-work');
  const now = normalizeText(options.now, 80) || new Date().toISOString();
  const tenantAlias = normalizeText(options.tenantAlias, 200)
    || normalizeText(globalThis.localStorage?.getItem?.('alias'), 200)
    || 'portal-operator';

  const task = [
    `Operator delegated task: ${requestedTask}`,
    'Complete low-risk read, analysis, drafting, inspection, or bounded internal work only.',
    'Do not send messages, spend money, change credentials/accounts, deploy/release, delete data, or perform other external writes.',
    'If a protected capability or human decision is required, stop and report the smallest approval or capability needed.',
    'Return a concise result with evidence or verification when practical.'
  ].join('\n');

  const workItem = createWorkItem({
    id,
    title: normalizeText(action.title, 160) || 'Operator delegated task',
    intent: requestedTask,
    domain: 'operator',
    workflow: 'operator-delegated-task',
    priority: 'normal',
    state: 'queued',
    risk: 'low',
    owner: 'operator',
    requiredCapabilities: ['auto'],
    createdAt: now,
    updatedAt: now,
    metadata: {
      workerLane: 'general',
      verificationStatus: 'not_started',
      requestedBy: 'portal-operator'
    }
  });

  const record = workItemToAgentQueueRecord(workItem, {
    task,
    tenantId: 'portal:operator',
    tenantAlias,
    tenantPlan: 'builder',
    backend: 'auto',
    riskClass: 'draft',
    approvalStatus: 'not_required',
    requiredCapabilities: 'auto',
    maxRuntimeMs: 120_000,
    requestedBy: 'portal-operator',
    workerLane: 'general'
  });

  return {
    workItem,
    record,
    summary: workItemToQueueSummary(record),
    runtime: workItemToRuntimeSidecar(workItem, { workerLane: 'general' })
  };
}

async function taskRequest(action, requestId, extra = {}) {
  const proof = await createSignedPortalProof('operator-runtime-task', action, {requestId,...extra});
  if (!proof) throw new Error('Sign in with your owner account before delegating work.');
  const response = await fetch('/api/operator-task', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify({action,requestId,...extra,...proof}), signal:AbortSignal.timeout(25000)
  });
  const result = await response.json();
  if (!response.ok || !result.ok) {
    const error = new Error(result.error || 'Task service unavailable.');
    error.status = response.status;
    throw error;
  }
  return result;
}

function watchConfirmedTask(requestId, options = {}) {
  let stopped = false;
  let timer;
  let failures = 0;
  const deadline = Date.now() + (options.timeoutMs ?? TASK_WATCH_TIMEOUT_MS);
  const stop = () => { stopped = true; clearTimeout(timer); };
  const poll = async () => {
    if (stopped) return;
    try {
      const result = await taskRequest('status', requestId);
      if (stopped) return;
      failures = 0;
      options.onUpdate?.({...result.record, id:`operator-http:${requestId}`});
      if (isOperatorTaskTerminal(result.record)) return stop();
    } catch (error) {
      if (stopped) return;
      failures += 1;
      if ([401,403,404].includes(error.status) || failures >= 3) {
        options.onUpdate?.({status:'status_unavailable',error:error.message});
        return stop();
      }
    }
    if (Date.now() >= deadline) {
      options.onUpdate?.({status:'status_unavailable',error:'Status polling timed out. The task may still be running; do not submit it again.'});
      return stop();
    }
    timer = setTimeout(poll, 2000);
  };
  void poll();
  return stop;
}

export async function queueOperatorTask(action = {}) {
  const text = normalizeText(action.text, 6000);
  if (!text) throw new Error('A delegated task is required.');
  const title = normalizeText(action.title, 160) || 'Operator delegated task';
  const requestId = action.requestId == null ? makeId('task') : String(action.requestId);
  if (!/^[A-Za-z0-9_-]{12,100}$/.test(requestId)) throw new Error('Invalid delegated task identity.');
  let confirmed = false;
  let message;
  try {
    await taskRequest('enqueue', requestId, {text,title});
    confirmed = true;
    message = 'The server saved your task for the Codex worker.';
  } catch (error) {
    if ([400,401,403].includes(error.status) || /Sign in/.test(error.message)) throw error;
    // A missing HTTP response is not proof that the write failed. Poll the
    // same request identity; never re-enqueue or silently fall back to Gun.
    message = 'Checking delivery. I will look up this task before any retry.';
  }
  return {taskId:`operator-http:${requestId}`,estimateMs:120000,confirmed,message,
    url:'',label:'Operator task'};
}

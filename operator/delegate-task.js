import { createWorkItem } from '../src/operator-runtime/work-item.js';
import { workItemToAgentQueueRecord, workItemToQueueSummary } from '../src/operator-runtime/task-queue-adapter.js';
import { workItemToRuntimeSidecar } from '../src/operator-runtime/runtime-sidecar.js';

const ROOT_KEY = '3dvr-portal';
const MANAGED_AGENT_OWNER_ALIAS = '3dvr-managed';
const DEFAULT_PEERS = [
  'wss://relay.3dvr.tech/gun',
  'wss://gun-relay-3dvr.fly.dev/gun'
];
const WRITE_TIMEOUT_MS = 8000;

function normalizeText(value = '', max = 4000) {
  return String(value || '').trim().slice(0, max);
}

function makeId(prefix) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

function putGun(node, value) {
  return new Promise((resolve, reject) => {
    if (!node || typeof node.put !== 'function') {
      reject(new Error('The 3DVR agent queue is unavailable in this browser.'));
      return;
    }
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ queued: true, pendingSync: true });
    }, WRITE_TIMEOUT_MS);
    node.put(value, ack => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (ack?.err) reject(new Error(String(ack.err)));
      else resolve(ack || {});
    });
  });
}

async function portalSignedIn() {
  if (globalThis.localStorage?.getItem?.('signedIn') === 'true') return true;
  try {
    const response = await globalThis.fetch?.('/api/session', {
      cache: 'no-store',
      credentials: 'same-origin'
    });
    if (!response?.ok) return false;
    return (await response.json())?.authenticated === true;
  } catch {
    return false;
  }
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

export async function queueOperatorTask(action = {}) {
  if (!await portalSignedIn()) {
    throw new Error('Sign in before delegating work to 3DVR Operator workers.');
  }
  if (typeof globalThis.Gun !== 'function') {
    throw new Error('The 3DVR agent queue is unavailable in this browser.');
  }

  const built = buildOperatorDelegatedTask(action);
  const gun = globalThis.Gun({ peers: globalThis.__GUN_PEERS__ || DEFAULT_PEERS });
  const taskQueue = gun
    .get(ROOT_KEY)
    .get('agentOps')
    .get(MANAGED_AGENT_OWNER_ALIAS)
    .get('taskQueue');

  const [taskWrite, latestWrite, runtimeWrite] = await Promise.all([
    putGun(taskQueue.get('tasks').get(built.record.id), built.record),
    putGun(taskQueue.get('latest').get(built.record.id), built.summary),
    putGun(taskQueue.get('runtime').get(built.record.id), built.runtime)
  ]);
  const pendingSync = Boolean(taskWrite?.pendingSync || latestWrite?.pendingSync || runtimeWrite?.pendingSync);

  return {
    taskId: built.record.id,
    message: pendingSync
      ? 'Queued the task locally. Operator Runtime will sync it when the relay reconnects.'
      : 'Delegated to Operator Runtime.',
    url: `/operator-runtime/?task=${encodeURIComponent(built.record.id)}`,
    label: 'Operator task'
  };
}

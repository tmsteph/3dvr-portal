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

function resolveRepository(repo = '') {
  const normalized = normalizeText(repo, 120).toLowerCase();
  if (!normalized || normalized === 'portal' || normalized === 'agent') return 'tmsteph/3dvr-portal';
  return /^[a-z0-9_.-]+\/[a-z0-9_.-]+$/i.test(normalized) ? normalized : 'tmsteph/3dvr-portal';
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

export async function queueOperatorAgentEdit(action = {}) {
  const requestedChange = normalizeText(action.text);
  if (!requestedChange) throw new Error('A code change request is required.');
  if (typeof globalThis.Gun !== 'function') throw new Error('Gun is unavailable.');

  const gun = globalThis.Gun({ peers: globalThis.__GUN_PEERS__ || DEFAULT_PEERS });
  const taskQueue = gun
    .get(ROOT_KEY)
    .get('agentOps')
    .get(MANAGED_AGENT_OWNER_ALIAS)
    .get('taskQueue');

  const id = makeId('remote-task-operator');
  const now = new Date().toISOString();
  const requestedRepo = normalizeText(action.repo, 80).toLowerCase() || 'portal';
  const repository = resolveRepository(requestedRepo);
  const scope = requestedRepo === 'agent'
    ? 'Focus the change on apps/agent/thomas-agent unless the task clearly requires shared portal code.'
    : 'Focus the change on the portal monorepo and keep the patch as small as practical.';
  const task = [
    `Operator approved code request: ${requestedChange}`,
    scope,
    'Run focused tests for the changed behavior.',
    'Use an isolated branch or worktree when practical. Do not deploy, merge, release, spend money, or change credentials automatically.'
  ].join('\n');
  const tenantAlias = normalizeText(globalThis.localStorage?.getItem?.('alias'), 200) || 'portal-operator';

  const workItem = createWorkItem({
    id,
    title: normalizeText(action.title, 160) || 'Operator code edit',
    intent: requestedChange,
    domain: 'software',
    workflow: 'operator-code-edit',
    priority: 'normal',
    state: 'queued',
    risk: 'medium',
    owner: 'engineering',
    requiredCapabilities: ['codex'],
    createdAt: now,
    updatedAt: now,
    metadata: {
      repo: repository,
      workerLane: 'workspace',
      verificationStatus: 'not_started',
      requestedBy: 'portal-operator'
    }
  });

  const record = workItemToAgentQueueRecord(workItem, {
    task,
    tenantId: 'portal:operator',
    tenantAlias,
    tenantPlan: 'builder',
    backend: 'codex',
    repo: repository,
    thinking: 'high',
    riskClass: 'workspace_write',
    approvalStatus: 'not_required',
    requiredCapabilities: 'codex',
    requestedBy: 'portal-operator',
    workerLane: 'workspace'
  });
  const summary = workItemToQueueSummary(record);
  const runtime = workItemToRuntimeSidecar(workItem, { workerLane: 'workspace' });

  const [taskWrite, latestWrite, runtimeWrite] = await Promise.all([
    putGun(taskQueue.get('tasks').get(id), record),
    putGun(taskQueue.get('latest').get(id), summary),
    putGun(taskQueue.get('runtime').get(id), runtime)
  ]);
  const pendingSync = Boolean(taskWrite?.pendingSync || latestWrite?.pendingSync || runtimeWrite?.pendingSync);
  return {
    taskId: id,
    message: pendingSync
      ? 'Sent the edit to the live agent queue locally; it will sync when the relay reconnects.'
      : 'Sent the edit to the live 3DVR agent worker queue.'
  };
}

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

  const record = {
    id,
    task,
    tenantId: 'portal:operator',
    tenantAlias,
    tenantPlan: 'builder',
    backend: 'codex',
    repo: resolveRepository(requestedRepo),
    model: '',
    thinking: 'high',
    unsafe: false,
    riskClass: 'workspace_write',
    approvalStatus: 'not_required',
    requiredCapabilities: 'codex',
    maxRuntimeMs: 0,
    status: 'queued',
    requestedBy: 'portal-operator',
    createdAt: now,
    updatedAt: now,
    resultSummary: '',
    error: '',
    workerDeviceId: ''
  };
  const summary = {
    id,
    status: record.status,
    task,
    tenantId: record.tenantId,
    tenantAlias: record.tenantAlias,
    tenantPlan: record.tenantPlan,
    riskClass: record.riskClass,
    approvalStatus: record.approvalStatus,
    requiredCapabilities: record.requiredCapabilities,
    updatedAt: now
  };

  const [taskWrite, latestWrite] = await Promise.all([
    putGun(taskQueue.get('tasks').get(id), record),
    putGun(taskQueue.get('latest').get(id), summary)
  ]);
  const pendingSync = Boolean(taskWrite?.pendingSync || latestWrite?.pendingSync);
  return {
    taskId: id,
    message: pendingSync
      ? 'Sent the edit to the live agent queue locally; it will sync when the relay reconnects.'
      : 'Sent the edit to the live 3DVR agent worker queue.'
  };
}

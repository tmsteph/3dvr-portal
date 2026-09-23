import Gun from 'gun';

import { buildOperatorDelegatedTask } from '../operator/delegate-task.js';

const relay = process.env.THREEDVR_GUN_RELAY || 'https://gun-relay-3dvr.fly.dev/gun';
const ownerAlias = process.env.THREEDVR_AGENT_OWNER_ALIAS || '3dvr-managed';
const maxWaitMs = Number(process.env.OPERATOR_RUNTIME_E2E_TIMEOUT_MS || 240000);
const pollMs = 2000;
const readTimeoutMs = 5000;
const writeTimeoutMs = 10000;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const taskId = `operator-e2e-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

const built = buildOperatorDelegatedTask({
  type: 'delegate_task',
  title: 'Operator runtime E2E',
  text: 'Fetch https://portal.3dvr.tech and report the HTML title. Read only. Make no changes.'
}, {
  id: taskId,
  now: new Date().toISOString(),
  tenantAlias: 'operator-runtime-e2e'
});

const gun = Gun({
  peers: [relay],
  radisk: false,
  localStorage: false
});
const queue = gun
  .get('3dvr-portal')
  .get('agentOps')
  .get(ownerAlias)
  .get('taskQueue');

function put(node, value) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('Gun write timeout'));
    }, writeTimeoutMs);
    node.put(value, ack => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (ack?.err) reject(new Error(String(ack.err)));
      else resolve(ack || {});
    });
  });
}

function once(node) {
  return new Promise(resolve => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(null);
    }, readTimeoutMs);
    node.once(data => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(data || null);
    });
  });
}

async function main() {
  console.log(`E2E_TASK_ID=${taskId}`);
  console.log(`E2E_RELAY=${relay}`);
  console.log(`E2E_OWNER=${ownerAlias}`);

  await Promise.all([
    put(queue.get('tasks').get(taskId), built.record),
    put(queue.get('latest').get(taskId), built.summary),
    put(queue.get('runtime').get(taskId), built.runtime)
  ]);
  console.log('E2E_ENQUEUED=true');

  const transitions = [];
  const deadline = Date.now() + maxWaitMs;
  let record = null;

  while (Date.now() < deadline) {
    record = await once(queue.get('tasks').get(taskId));
    const state = record?.status || record?.state || 'missing';
    if (transitions.at(-1) !== state) {
      transitions.push(state);
      console.log(`E2E_STATE=${state}`);
    }
    if (['completed', 'failed', 'rejected', 'approval_required'].includes(state)) break;
    await sleep(pollMs);
  }

  console.log(`E2E_TRANSITIONS=${JSON.stringify(transitions)}`);
  console.log(`E2E_RESULT=${JSON.stringify({
    status: record?.status || record?.state || '',
    resultSummary: record?.resultSummary || '',
    error: record?.error || '',
    workerDeviceId: record?.workerDeviceId || ''
  })}`);

  if ((record?.status || record?.state) !== 'completed') {
    throw new Error(`Operator runtime task did not complete: ${record?.status || record?.state || 'timeout'} ${record?.error || ''}`);
  }
}

main()
  .then(() => {
    console.log('E2E_PASS=true');
    setTimeout(() => process.exit(0), 200);
  })
  .catch(error => {
    console.error(error?.stack || error?.message || String(error));
    setTimeout(() => process.exit(1), 200);
  });

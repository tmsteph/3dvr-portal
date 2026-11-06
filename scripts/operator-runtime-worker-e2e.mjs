import Gun from 'gun';

import { buildOperatorDelegatedTask } from '../operator/delegate-task.js';

const peers = String(process.env.THREEDVR_GUN_PEERS || process.env.THREEDVR_GUN_RELAY || '')
  .split(',')
  .map(value => value.trim())
  .filter(Boolean);
const ownerAlias = String(process.env.THREEDVR_AGENT_OWNER_ALIAS || '').trim();
const allowEnqueue = process.env.OPERATOR_RUNTIME_E2E_ALLOW_ENQUEUE === 'true';
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
  peers,
  radisk: false,
  localStorage: false
});
const queue = gun
  .get('3dvr-portal')
  .get('agentOps')
  .get(ownerAlias)
  .get('taskQueue');

function put(node, value) {
  return new Promise(resolve => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ acknowledged: false, timedOut: true });
    }, writeTimeoutMs);
    node.put(value, ack => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        acknowledged: Boolean(ack && !ack.err && typeof ack.ok === 'number' && ack.ok > 0),
        error: ack?.err ? String(ack.err) : '',
        ack: ack || {}
      });
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
  if (!allowEnqueue) throw new Error('Refusing to enqueue: set OPERATOR_RUNTIME_E2E_ALLOW_ENQUEUE=true in an explicitly approved isolated test environment');
  if (!ownerAlias || ownerAlias === '3dvr-managed') throw new Error('Refusing shared/default queue: set THREEDVR_AGENT_OWNER_ALIAS to an isolated test worker owner');
  if (!peers.length) throw new Error('Refusing enqueue without an explicitly configured isolated Gun relay');
  if (peers.some(peer => /gun-relay-3dvr\.fly\.dev/i.test(peer))) throw new Error('Refusing shared public Gun relay; use an isolated test relay');
  console.log(`E2E_TASK_ID=${taskId}`);
  console.log(`E2E_PEERS=${peers.join(',')}`);
  console.log(`E2E_OWNER=${ownerAlias}`);

  gun.on('hi', peer => console.log(`E2E_PEER_HI=${peer?.url || peer || 'unknown'}`));
  gun.on('bye', peer => console.log(`E2E_PEER_BYE=${peer?.url || peer || 'unknown'}`));

  const writes = await Promise.all([
    put(queue.get('tasks').get(taskId), built.record),
    put(queue.get('latest').get(taskId), built.summary),
    put(queue.get('runtime').get(taskId), built.runtime)
  ]);
  console.log(`E2E_WRITE_RESULTS=${JSON.stringify(writes)}`);
  if (writes.some(write => !write.acknowledged || write.timedOut)) {
    throw new Error('Queue write acknowledgment failed; execution cannot be verified');
  }
  console.log('E2E_ENQUEUE_ACKNOWLEDGED=true');

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

  if ((record?.status || record?.state) === 'completed' && (!String(record?.workerDeviceId || '').trim() || !String(record?.resultSummary || '').trim())) {
    throw new Error('Task marked completed without worker identity and nonempty result summary');
  }
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

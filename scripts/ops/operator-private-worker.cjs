const path = require('node:path');

async function runOnce(queue, onlyTaskId = '') {
  const options = { queueStore: 'sqlite', gunSync: false, ...(onlyTaskId ? { onlyTaskId } : {}) };
  const tasks = await queue.listTasks(options);
  const task = tasks.find(record => (!onlyTaskId || record.id === onlyTaskId)
    && record.id?.startsWith('operator-http-')
    // The SQLite source column, not a user-controlled ID prefix, proves that
    // the task came through the signed owner HTTP admission path.
    && record.queueSource === 'operator-http'
    && record.status === 'queued' && record.backend === 'codex' && !record.unsafe
    && queue.canWorkerRunTask(record, options).ok);
  if (!task) return 0;
  // Reuse the existing atomic claim, native executor, and private result storage.
  // Running/uncertain and legacy relay tasks are never replayed by this worker.
  const result = await queue.runQueuedTask(task, options);
  // A failed native execution has a durable failed result, not a successful
  // canary receipt. Distinguish it from a lost claim/policy skip.
  if (result?.skipped === true) return 0;
  if (result?.ok !== true) return -1;
  // Both pinned canaries and the continuous private worker must prove that
  // execution was saved durably before reporting success. A missing/uncertain
  // receipt is a visible failure, never permission to replay a claimed task.
  let receipt;
  try {
    receipt = await queue.readTask(task.id, options);
  } catch {
    return -1;
  }
  if (receipt?.status !== 'completed' || receipt.queueSource !== 'operator-http'
    || !String(receipt.resultText || '').trim()) return -1;
  return 1;
}

// The private poller must advertise its own *actual* same-queue liveness.
// Distinguish its process from a general worker on the same host, so one
// worker's capability/pin snapshot cannot overwrite the other's heartbeat.
function publishPrivateWorkerHeartbeat(queue, store, onlyTaskId = '', storeOptions = {}) {
  const options = { ...storeOptions, queueStore: 'sqlite', gunSync: false,
    ...(onlyTaskId ? { onlyTaskId } : {}) };
  const profile = queue.workerProfile(options);
  if (!profile.workerId) throw new Error('Private worker identity unavailable');
  const wrote = store.writeWorkerHeartbeat({
    ...profile,
    workerId: `${profile.workerId}:operator-private:${process.pid}`,
  }, options);
  if (!wrote) throw new Error('Private worker heartbeat not persisted');
  return true;
}

async function main() {
  if (process.env.THREEDVR_AGENT_QUEUE_STORE !== 'sqlite'
    || process.env.THREEDVR_AGENT_OWNER_ALIAS !== '3dvr-managed') {
    throw new Error('Managed SQLite queue configuration is required.');
  }
  // A supervised canary may authorize exactly one task ID, never a queue drain.
  const legacyPin = process.env.THREEDVR_AGENT_ONLY_TASK_ID || '';
  const canonicalPin = process.env.THREEDVR_AGENT_WORKER_ONLY_TASK_ID || '';
  if (legacyPin && canonicalPin && legacyPin !== canonicalPin) {
    throw new Error('Conflicting private Operator exact-task-ID pins.');
  }
  const onlyTaskId = canonicalPin || legacyPin;
  if (onlyTaskId && !/^operator-http-[A-Za-z0-9_-]{1,128}$/.test(onlyTaskId)) {
    throw new Error('Invalid exact-task-ID pin for private Operator worker.');
  }
  if (onlyTaskId) process.env.THREEDVR_AGENT_WORKER_ONLY_TASK_ID = onlyTaskId;
  process.env.THREEDVR_AGENT_QUEUE_GUN_SYNC = '0';
  const queue = require(path.join(process.env.THREEDVR_PRIVATE_AGENT_ROOT, 'thomas-agent/node/agent-task-queue.js'));
  const sqlite = require(path.join(process.env.THREEDVR_PRIVATE_AGENT_ROOT, 'thomas-agent/node/task-queue-sqlite-store.js'));
  await runLoop(queue, {
    onlyTaskId,
    onPoll: () => publishPrivateWorkerHeartbeat(queue, sqlite, onlyTaskId),
    onProcessed: () => console.log('Private Operator task processed; result saved in the owner queue.'),
    onFailed: () => console.error('Private Operator task failed; inspect the durable result in the owner queue.'),
  });
}

// A pinned canary is a bounded one-shot operation, not an indefinite worker.
// Waiting briefly permits admission to arrive after supervisor startup, but a
// missing, blocked, or already-terminal task must produce a visible failure.
const PIN_TIMEOUT_MESSAGE = 'Pinned Operator canary timed out without an execution receipt; inspect exact task status.';
const PIN_FAILED_MESSAGE = 'Pinned Operator canary failed; inspect exact task result in the owner queue.';
async function runLoop(queue, {
  onlyTaskId = '',
  pollMs = 10000,
  pinTimeoutMs = 120000,
  now = Date.now,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  onProcessed = () => {},
  onFailed = () => {},
  onPoll = () => {},
} = {}) {
  const startedAt = now();
  for (;;) {
    // Fail closed on a missing/failed SQLite heartbeat: the signed admission
    // endpoint must not mistake a configured-but-unavailable worker for ready.
    await onPoll();
    const count = await runOnce(queue, onlyTaskId);
    if (count < 0) {
      if (onlyTaskId) throw new Error(PIN_FAILED_MESSAGE);
      // A durable failed task must never disappear into a healthy-looking poll.
      // Keep the shared worker alive for unrelated queued work.
      onFailed();
    }
    if (count > 0) {
      onProcessed();
      // A pinned worker never broadens to another queued task.
      if (onlyTaskId) return 1;
    }
    if (onlyTaskId && now() - startedAt >= pinTimeoutMs) {
      throw new Error(PIN_TIMEOUT_MESSAGE);
    }
    await sleep(pollMs);
  }
}

module.exports = { runOnce, runLoop, publishPrivateWorkerHeartbeat };
if (require.main === module) main().catch(error => {
  console.error([PIN_TIMEOUT_MESSAGE, PIN_FAILED_MESSAGE].includes(error?.message)
    ? error.message
    : 'Private Operator worker stopped; inspect queue configuration and transport.');
  process.exit(1);
});

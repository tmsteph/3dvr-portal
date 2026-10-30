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
  // A lost claim or policy skip is not an execution receipt.
  return result && result.skipped !== true ? 1 : 0;
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
  for (;;) {
    const count = await runOnce(queue, onlyTaskId);
    if (count) console.log('Private Operator task processed; result saved in the owner queue.');
    // A pinned worker is one-shot; a supervisor restart cannot replay a
    // terminal task, and never broadens the pin to other queued work.
    if (onlyTaskId && count) return;
    await new Promise(resolve => setTimeout(resolve, 10000));
  }
}

module.exports = { runOnce };
if (require.main === module) main().catch(() => {
  console.error('Private Operator worker stopped; inspect queue configuration and transport.');
  process.exit(1);
});

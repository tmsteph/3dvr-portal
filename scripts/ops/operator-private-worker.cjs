const path = require('node:path');

async function runOnce(queue) {
  const options = { queueStore: 'sqlite', gunSync: false };
  const tasks = await queue.listTasks(options);
  const task = tasks.find(record => record.id?.startsWith('operator-http-')
    // The SQLite source column, not a user-controlled ID prefix, proves that
    // the task came through the signed owner HTTP admission path.
    && record.queueSource === 'operator-http'
    && record.status === 'queued' && record.backend === 'codex' && !record.unsafe
    && queue.canWorkerRunTask(record, options).ok);
  if (!task) return 0;
  // Reuse the existing atomic claim, native executor, and private result storage.
  // Running/uncertain and legacy relay tasks are never replayed by this worker.
  await queue.runQueuedTask(task, options);
  return 1;
}

async function main() {
  if (process.env.THREEDVR_AGENT_QUEUE_STORE !== 'sqlite'
    || process.env.THREEDVR_AGENT_OWNER_ALIAS !== '3dvr-managed') {
    throw new Error('Managed SQLite queue configuration is required.');
  }
  process.env.THREEDVR_AGENT_QUEUE_GUN_SYNC = '0';
  const queue = require(path.join(process.env.THREEDVR_PRIVATE_AGENT_ROOT, 'thomas-agent/node/agent-task-queue.js'));
  for (;;) {
    const count = await runOnce(queue);
    if (count) console.log('Private Operator task processed; result saved in the owner queue.');
    await new Promise(resolve => setTimeout(resolve, 10000));
  }
}

module.exports = { runOnce };
if (require.main === module) main().catch(() => {
  console.error('Private Operator worker stopped; inspect queue configuration and transport.');
  process.exit(1);
});

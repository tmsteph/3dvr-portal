import { executeRepoStatus } from './hosted-task-executor.js';

// Single bounded worker iteration. This is intentionally not an HTTP endpoint:
// authentication, quota accounting, and worker isolation must be wired first.
export async function runHostedTaskOnce(store, id, options = {}) {
  const task = await store.claim(id, options.leaseMs || 60_000);
  if (!task) return { claimed: false };
  try {
    const result = await executeRepoStatus(task, options);
    const saved = await store.complete(id, result);
    return { claimed: true, completed: saved, taskId: id };
  } catch (error) {
    // Leave the lease for controlled retry/recovery; never expose upstream details.
    return { claimed: true, completed: false, taskId: id, error: 'task_execution_failed' };
  }
}

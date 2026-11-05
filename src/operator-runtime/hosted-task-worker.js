import { executeRepoStatus } from './hosted-task-executor.js';

// Single bounded worker iteration. This is intentionally not an HTTP endpoint:
// authentication, quota accounting, and worker isolation must be wired first.
export async function runHostedTaskOnce(store, id, options = {}) {
  const task = await store.claim(id, options.leaseMs || 60_000);
  if (!task) return { claimed: false };
  const controller = new AbortController();
  let checking = false;
  const timer = setInterval(async () => {
    if (checking) return;
    checking = true;
    try {
      const current = await store.get(task.tenantId, id);
      if (!current || current.status !== 'running' || current.leaseToken !== task.leaseToken) {
        controller.abort();
      }
    } catch {
      controller.abort();
    } finally {
      checking = false;
    }
  }, 100);
  try {
    const signal = options.signal
      ? AbortSignal.any([options.signal, controller.signal]) : controller.signal;
    const result = await executeRepoStatus(task, { ...options, signal });
    const saved = await store.complete(id, result, task.leaseToken);
    return { claimed: true, completed: saved, taskId: id };
  } catch (error) {
    // Leave the lease for controlled retry/recovery; never expose upstream details.
    return { claimed: true, completed: false, taskId: id, error: 'task_execution_failed' };
  } finally {
    clearInterval(timer);
  }
}

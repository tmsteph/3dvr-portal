import { HostedTaskStore } from '../src/operator-runtime/hosted-task-store.js';
import { runHostedTaskOnce } from '../src/operator-runtime/hosted-task-worker.js';

// Run once under a dedicated restricted service account or timer.
// This script never opens an HTTP listener or executes arbitrary commands.
export async function runPilotWorkerOnce({ path = process.env.HOSTED_OPERATOR_PILOT_STORE, store, options } = {}) {
  if (!path && !store) throw new Error('pilot_store_not_configured');
  const taskStore = store || new HostedTaskStore(path);
  const recovered = await taskStore.recoverExpired();
  const snapshot = await taskStore.read();
  const queued = snapshot.filter(task => task.status === 'queued').slice(0, 10);
  const outcomes = [];
  for (const task of queued) {
    outcomes.push(await runHostedTaskOnce(taskStore, task.id, options));
  }
  return { recovered, scanned: queued.length, completed: outcomes.filter(x => x.completed).length };
}

if (process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href) {
  runPilotWorkerOnce().then(
    result => { process.stdout.write(JSON.stringify(result) + '\n'); },
    error => { process.stderr.write('hosted_pilot_worker_failed\n'); process.exitCode = 1; }
  );
}

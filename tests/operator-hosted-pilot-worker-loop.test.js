import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HostedTaskStore } from '../src/operator-runtime/hosted-task-store.js';
import { runPilotWorkerOnce } from '../scripts/hosted-operator-worker.mjs';

test('bounded worker drains queued tasks with persisted results', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'hosted-pilot-loop-'));
  try {
    const store = new HostedTaskStore(join(dir, 'tasks.json'));
    const created = await store.submit('sea:abc123', {
      kind: 'repo-status', repository: 'tmsteph/3dvr-portal', idempotencyKey: 'worker-loop-123'
    }, { remainingCents: 1 });
    assert.equal(created.ok, true);
    const output = await runPilotWorkerOnce({
      store, options: { fetchImpl: async () => ({
        ok: true, json: async () => ({
          full_name: 'tmsteph/3dvr-portal', default_branch: 'main', open_issues_count: 2
        })
      }) }
    });
    assert.equal(output.completed, 1);
    assert.equal((await store.get('sea:abc123', created.task.id)).status, 'completed');
    assert.equal((await runPilotWorkerOnce({ store })).completed, 0);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

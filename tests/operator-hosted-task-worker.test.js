import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HostedTaskStore } from '../src/operator-runtime/hosted-task-store.js';
import { runHostedTaskOnce } from '../src/operator-runtime/hosted-task-worker.js';

test('submitted job executes and result survives reopening store', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'operator-worker-'));
  try {
    const path = join(dir, 'tasks.json');
    const store = new HostedTaskStore(path);
    const request = { kind: 'repo-status', repository: 'tmsteph/3dvr-portal', idempotencyKey: 'worker-test-123' };
    const { task } = await store.submit('pilot-a', request, { remainingCents: 10 });
    const outcome = await runHostedTaskOnce(store, task.id, {
      fetchImpl: async () => ({ ok: true, json: async () => ({
        full_name: 'tmsteph/3dvr-portal', default_branch: 'main', open_issues_count: 5
      }) })
    });
    assert.equal(outcome.completed, true);
    assert.equal(JSON.parse((await new HostedTaskStore(path).get('pilot-a', task.id)).result).openIssues, 5);
    assert.equal(await store.get('pilot-b', task.id), null);
    assert.equal((await runHostedTaskOnce(store, task.id)).claimed, false);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

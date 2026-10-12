import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HostedTaskStore } from '../src/operator-runtime/hosted-task-store.js';

test('durable submit, tenant ownership, claim and restart recovery', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'hosted-task-'));
  try {
    const path = join(dir, 'tasks.json');
    const store = new HostedTaskStore(path);
    const request = { kind: 'repo-status', repository: 'tmsteph/3dvr-portal', idempotencyKey: 'durable-test-123' };
    const first = await store.submit('pilot-a', request, { remainingCents: 1 });
    assert.equal(first.ok, true);
    assert.equal((await store.submit('pilot-a', request, { remainingCents: 1 })).duplicate, true);
    assert.equal(await store.get('pilot-b', first.task.id), null);
    const running = await store.claim(first.task.id, 1);
    assert.equal(running.status, 'running');
    const restarted = new HostedTaskStore(path);
    assert.equal(await restarted.recoverExpired(Date.now() + 1000), 1);
    assert.equal((await restarted.get('pilot-a', first.task.id)).status, 'queued');
    const second = await restarted.claim(first.task.id);
    assert.equal(await restarted.complete(first.task.id, 'stale', running.leaseToken), false);
    assert.equal(await restarted.complete(first.task.id, 'read-only report', second.leaseToken), true);
    assert.equal((await store.get('pilot-a', first.task.id)).result, 'read-only report');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

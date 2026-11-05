import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HostedTaskStore } from '../src/operator-runtime/hosted-task-store.js';

// This test is intentionally skipped until crash-safe lock reclamation is
// implemented. Never reclaim based solely on a file's age: the owner may live.
test.skip('orphaned task-store lock is safely reclaimed after owner death', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'hosted-orphan-'));
  const path = join(dir, 'tasks.json');
  try {
    await writeFile(path + '.lock', JSON.stringify({
      pid: 99999999, nonce: 'dead-owner-test', createdAt: Date.now() - 60000
    }), { mode: 0o600 });
    const store = new HostedTaskStore(path);
    const result = await store.submit('tenant-one', {
      kind: 'repo-status',
      repository: 'tmsteph/3dvr-portal',
      idempotencyKey: 'orphanlocktest01'
    }, { remainingCents: 100 });
    assert.equal(result.ok, true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

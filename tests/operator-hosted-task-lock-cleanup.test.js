import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HostedTaskStore } from '../src/operator-runtime/hosted-task-store.js';

test('transaction failure releases lock and allows the next submission', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'hosted-lock-'));
  const path = join(dir, 'tasks.json');
  try {
    const store = new HostedTaskStore(path);
    await assert.rejects(store.transact(() => { throw new Error('simulated_failure'); }), /simulated_failure/);
    await assert.rejects(stat(path + '.lock'), { code: 'ENOENT' });
    const result = await store.submit('tenant-one', {
      kind: 'repo-status',
      repository: 'tmsteph/3dvr-portal',
      idempotencyKey: 'lockrecoverytest01'
    }, { remainingCents: 100 });
    assert.equal(result.ok, true);
    assert.equal((JSON.parse(await readFile(path, 'utf8'))).length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

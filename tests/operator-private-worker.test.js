import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
const { runOnce } = require('../scripts/ops/operator-private-worker.cjs');
const sqlite = require('../apps/agent/thomas-agent/node/task-queue-sqlite-store.js');
const { DatabaseSync } = require('node:sqlite');

test('private worker preserves legacy, running, unsafe, and policy-blocked tasks', async () => {
  const task = (id, patch = {}) => ({ id, status: 'queued', backend: 'codex', queueSource: 'operator-http', ...patch });
  const records = [task('legacy-shell', { backend: 'shell' }), task('legacy-auto'),
    task('operator-http-running', { status: 'running', claimExpiresAt: 0 }),
    task('operator-http-unsafe', { unsafe: true }), task('operator-http-policy-blocked'),
    task('operator-http-shell', { backend: 'shell' }), task('operator-http-completed', { status: 'completed' }),
    task('operator-http-gun', { queueSource: 'gun' }),
    task('operator-http-legacy', { queueSource: 'sqlite' }),
    task('operator-http-unknown', { queueSource: undefined }),
    task('operator-http-ready'), task('operator-http-next')];
  const calls = [];
  const queue = {
    listTasks: options => { assert.deepEqual(options, { queueStore: 'sqlite', gunSync: false }); return records; },
    canWorkerRunTask: record => ({ ok: record.id !== 'operator-http-policy-blocked' }),
    runQueuedTask: (record, options) => { calls.push({ id: record.id, options }); return { ok: true }; }
  };
  assert.equal(await runOnce(queue), 1);
  assert.deepEqual(calls, [{ id: 'operator-http-ready', options: { queueStore: 'sqlite', gunSync: false } }]);
});

test('an idle queue does not dispatch or enqueue work', async () => {
  assert.equal(await runOnce({ listTasks: () => [], runQueuedTask: () => assert.fail('unexpected execution') }), 0);
});

test('atomic claim rejects a source switch after the worker snapshot without a false receipt', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'operator-private-source-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const options = { queueDb: join(dir, 'queue.sqlite'), ownerAlias: '3dvr-managed' };
  const signedId = 'operator-http-signed-task';
  const task = { id: signedId, task: 'synthetic only', status: 'queued',
    backend: 'codex', updatedAt: '2026-10-30T00:00:00.000Z' };
  sqlite.writeTask(task, { ...options, queueSource: 'operator-http' });
  const staleSnapshot = sqlite.listTasks(options);
  assert.equal(staleSnapshot[0].queueSource, 'operator-http');

  // The public relay is no longer allowed to overwrite signed tasks.
  assert.equal(sqlite.importTask({ ...task, updatedAt: '2026-10-30T00:01:00.000Z' }, options), false);
  // Still test the claim's defense in depth against a direct DB provenance change
  // between the worker's list snapshot and atomic claim.
  const db = new DatabaseSync(options.queueDb);
  try {
    db.prepare("UPDATE tasks SET source = 'gun' WHERE owner_alias = ? AND id = ?")
      .run(options.ownerAlias, signedId);
  } finally { db.close(); }
  assert.equal(sqlite.readTask(signedId, options).queueSource, 'gun');
  let executions = 0;
  const queue = {
    listTasks: () => staleSnapshot,
    canWorkerRunTask: () => ({ ok: true }),
    runQueuedTask: () => {
      const claimed = sqlite.claimTask(signedId, 'stale-token', 'worker', Date.now() + 60000, Date.now(), options);
      if (claimed) executions++;
      return claimed ? { ok: true } : { ok: false, skipped: true };
    },
  };
  assert.equal(await runOnce(queue), 0);
  assert.equal(executions, 0);
  assert.equal(sqlite.readTask(signedId, options).status, 'queued');

  // Fresh signed work remains claimable; legacy IDs retain existing behavior.
  const fresh = { ...task, id: 'operator-http-fresh-task' };
  sqlite.writeTask(fresh, { ...options, queueSource: 'operator-http' });
  assert.ok(sqlite.claimTask(fresh.id, 'fresh-token', 'worker', Date.now() + 60000, Date.now(), options));
  const legacy = { ...task, id: 'legacy-task' };
  sqlite.writeTask(legacy, options);
  assert.ok(sqlite.claimTask(legacy.id, 'legacy-token', 'worker', Date.now() + 60000, Date.now(), options));
});

test('exact-task-ID pin processes only the authorized signed canary, not the next queued task', async () => {
  const records = ['operator-http-first', 'operator-http-pinned', 'operator-http-third']
    .map(id => ({ id, queueSource: 'operator-http', status: 'queued', backend: 'codex' }));
  const executed = [];
  const queue = {
    listTasks: () => records,
    canWorkerRunTask: () => ({ ok: true }),
    runQueuedTask: task => { executed.push(task.id); return { ok: true }; },
  };
  assert.equal(await runOnce(queue, 'operator-http-pinned'), 1);
  assert.deepEqual(executed, ['operator-http-pinned']);
  assert.equal(await runOnce(queue, 'operator-http-missing'), 0);
  assert.deepEqual(executed, ['operator-http-pinned']);
  records[1].queueSource = 'gun';
  assert.equal(await runOnce(queue, 'operator-http-pinned'), 0);
  assert.deepEqual(executed, ['operator-http-pinned']);
});

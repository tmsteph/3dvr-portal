import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
const { runOnce, runLoop } = require('../scripts/ops/operator-private-worker.cjs');
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
    runQueuedTask: (task, options) => {
      assert.equal(options.onlyTaskId, 'operator-http-pinned');
      executed.push(task.id);
      return { ok: true };
    },
  };
  assert.equal(await runOnce(queue, 'operator-http-pinned'), 1);
  assert.deepEqual(executed, ['operator-http-pinned']);
  assert.equal(await runOnce(queue, 'operator-http-missing'), 0);
  assert.deepEqual(executed, ['operator-http-pinned']);
  records[1].queueSource = 'gun';
  assert.equal(await runOnce(queue, 'operator-http-pinned'), 0);
  assert.deepEqual(executed, ['operator-http-pinned']);
});


test('SQLite atomic claim rejects other signed tasks despite a stale worker snapshot', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'operator-private-pin-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const options = { queueDb: join(dir, 'queue.sqlite'), ownerAlias: '3dvr-managed' };
  const task = id => ({ id, task: 'synthetic only', status: 'queued', backend: 'codex', updatedAt: '2026-10-30T00:00:00.000Z' });
  const pinnedId = 'operator-http-pinned';
  const otherId = 'operator-http-other';
  sqlite.writeTask(task(pinnedId), { ...options, queueSource: 'operator-http' });
  sqlite.writeTask(task(otherId), { ...options, queueSource: 'operator-http' });
  const scope = { ...options, onlyTaskId: pinnedId };
  const now = Date.now();
  assert.equal(sqlite.claimTask(otherId, 'other-token', 'worker', now + 60000, now, scope), null);
  assert.equal(sqlite.readTask(otherId, options).status, 'queued');
  assert.ok(sqlite.claimTask(pinnedId, 'pinned-token', 'worker', now + 60000, now, scope));
  assert.equal(sqlite.readTask(pinnedId, options).status, 'running');
  assert.equal(sqlite.readTask(otherId, options).status, 'queued');
});

test('pinned canary stops with a visible timeout instead of polling forever', async () => {
  let clock = 0;
  let polls = 0;
  const queue = {
    listTasks: () => { polls += 1; return []; },
    runQueuedTask: () => assert.fail('missing canary must not execute'),
  };
  await assert.rejects(runLoop(queue, {
    onlyTaskId: 'operator-http-missing',
    pinTimeoutMs: 20000,
    pollMs: 10000,
    now: () => clock,
    sleep: async ms => { clock += ms; },
  }), /Pinned Operator canary timed out without an execution receipt/);
  assert.equal(polls, 3);
  assert.equal(clock, 20000);
});

test('pinned canary waits for late admission then executes only the exact task once', async () => {
  let polls = 0;
  let clock = 0;
  const executions = [];
  const records = [
    { id: 'operator-http-other', status: 'queued', backend: 'codex', queueSource: 'operator-http' },
    { id: 'operator-http-approved', status: 'queued', backend: 'codex', queueSource: 'operator-http' },
  ];
  const queue = {
    listTasks: () => { polls += 1; return polls < 3 ? [] : records; },
    canWorkerRunTask: () => ({ ok: true }),
    runQueuedTask: (task, options) => {
      assert.equal(options.onlyTaskId, 'operator-http-approved');
      executions.push(task.id);
      return { ok: true };
    },
  };
  let receipts = 0;
  assert.equal(await runLoop(queue, {
    onlyTaskId: 'operator-http-approved',
    pinTimeoutMs: 20000,
    pollMs: 10000,
    now: () => clock,
    sleep: async ms => { clock += ms; },
    onProcessed: () => { receipts += 1; },
  }), 1);
  assert.equal(polls, 3);
  assert.deepEqual(executions, ['operator-http-approved']);
  assert.equal(receipts, 1);
});

test('native execution failure is not counted as a successful private task', async () => {
  const record = { id: 'operator-http-failed', queueSource: 'operator-http',
    status: 'queued', backend: 'codex' };
  for (const result of [{ ok: false, error: 'synthetic failure' }, { ok: false }, null]) {
    const queue = {
      listTasks: () => [record],
      canWorkerRunTask: () => ({ ok: true }),
      runQueuedTask: () => result,
    };
    assert.equal(await runOnce(queue, record.id), -1);
  }
  const skippedQueue = {
    listTasks: () => [record],
    canWorkerRunTask: () => ({ ok: true }),
    runQueuedTask: () => ({ ok: false, skipped: true }),
  };
  assert.equal(await runOnce(skippedQueue, record.id), 0);
});

test('pinned canary exits on failed native execution without reporting completion', async () => {
  const record = { id: 'operator-http-failed', queueSource: 'operator-http',
    status: 'queued', backend: 'codex' };
  let attempts = 0;
  let completed = 0;
  const queue = {
    listTasks: () => [record],
    canWorkerRunTask: () => ({ ok: true }),
    runQueuedTask: () => { attempts += 1; return { ok: false, error: 'synthetic failure' }; },
  };
  await assert.rejects(runLoop(queue, {
    onlyTaskId: record.id,
    sleep: () => assert.fail('failed canary must not be retried'),
    onProcessed: () => { completed += 1; },
  }), /Pinned Operator canary failed; inspect exact task result/);
  assert.equal(attempts, 1);
  assert.equal(completed, 0);
});

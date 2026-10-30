import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { runOnce } = createRequire(import.meta.url)('../scripts/ops/operator-private-worker.cjs');

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
    runQueuedTask: (record, options) => calls.push({ id: record.id, options })
  };
  assert.equal(await runOnce(queue), 1);
  assert.deepEqual(calls, [{ id: 'operator-http-ready', options: { queueStore: 'sqlite', gunSync: false } }]);
});

test('an idle queue does not dispatch or enqueue work', async () => {
  assert.equal(await runOnce({ listTasks: () => [], runQueuedTask: () => assert.fail('unexpected execution') }), 0);
});

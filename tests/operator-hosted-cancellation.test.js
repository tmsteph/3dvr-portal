import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HostedTaskStore } from '../src/operator-runtime/hosted-task-store.js';
import { runHostedTaskOnce } from '../src/operator-runtime/hosted-task-worker.js';
import { createHostedTaskHandler } from '../src/operator-runtime/hosted-task-handler.js';
import { createHostedPilotClient } from '../operator/hosted-pilot-client.js';

async function fixture(run) {
  const dir = await mkdtemp(join(tmpdir(), 'hosted-cancel-'));
  try {
    const store = new HostedTaskStore(join(dir, 'tasks.json'));
    await store.setBudget('sea:alice', 1);
    const { task } = await store.submit('sea:alice', {
      kind: 'repo-status', repository: 'tmsteph/3dvr-portal', idempotencyKey: 'cancel-key-123'
    }, { reservationCents: 1 });
    await run(store, task);
  } finally { await rm(dir, { recursive: true, force: true }); }
}

test('queued cancellation is private, durable and refunds only once', async () => {
  await fixture(async (store, task) => {
    assert.equal((await store.cancel('sea:bob', task.id)).reason, 'not_found');
    assert.equal((await store.get('sea:alice', task.id)).status, 'queued');
    assert.equal((await store.cancel('sea:alice', task.id)).task.status, 'cancelled');
    assert.equal((await store.cancel('sea:alice', task.id)).duplicate, true);
    assert.equal((await store.budget('sea:alice')).reservedCents, 0);
    assert.equal(await store.claim(task.id), null);
    assert.equal((await new HostedTaskStore(store.path).get('sea:alice', task.id)).status, 'cancelled');
  });
});

test('running cancellation blocks late results and retains uncertain spending', async () => {
  await fixture(async (store, task) => {
    const running = await store.claim(task.id);
    await store.cancel('sea:alice', task.id);
    assert.equal(await store.complete(task.id, 'late', running.leaseToken), false);
    assert.equal(await store.recoverExpired(Date.now() + 120000), 0);
    assert.equal((await store.budget('sea:alice')).reservedCents, 1);
    assert.equal((await store.budget('sea:alice')).accountedCents, 0);
  });
});

test('recovered queued cancellation retains earlier uncertain spending', async () => {
  await fixture(async (store, task) => {
    await store.claim(task.id, 1);
    await store.recoverExpired(Date.now() + 1000);
    await store.cancel('sea:alice', task.id);
    assert.equal((await store.budget('sea:alice')).reservedCents, 1);
  });
});

test('completion winning the race cannot be cancelled or refunded', async () => {
  await fixture(async (store, task) => {
    const running = await store.claim(task.id);
    assert.equal(await store.complete(task.id, 'done', running.leaseToken), true);
    assert.equal((await store.cancel('sea:alice', task.id)).reason, 'task_terminal');
    assert.equal((await store.budget('sea:alice')).accountedCents, 1);
  });
});

test('worker aborts in-flight fetch after durable cancellation', { timeout: 5000 }, async () => {
  await fixture(async (store, task) => {
    let started;
    const ready = new Promise(resolve => { started = resolve; });
    let aborted = false;
    const work = runHostedTaskOnce(store, task.id, {
      fetchImpl: async (url, { signal }) => {
        started();
        return new Promise((resolve, reject) => {
          signal.addEventListener('abort', () => {
            aborted = true;
            reject(new Error('aborted'));
          }, { once: true });
        });
      }
    });
    await ready;
    await store.cancel('sea:alice', task.id);
    assert.equal((await work).completed, false);
    assert.equal(aborted, true);
    assert.equal((await store.get('sea:alice', task.id)).status, 'cancelled');
  });
});

test('signed cancellation binds task, action, route and derived tenant', async () => {
  await fixture(async (store, task) => {
    const handler = createHostedTaskHandler({
      store, origin: 'https://portal.3dvr.tech',
      verify: async body => ({ ok: true, identity: { pub: body.authPub, action: body.signedAction || body.action },
        verified: { taskId: body.signedTaskId || body.taskId } })
    });
    async function request(body, url = '/tasks/cancel') {
      const res = { setHeader() {}, end(value) { this.body = JSON.parse(value); } };
      await handler({ method: 'POST', url, body }, res);
      return res;
    }
    assert.equal((await request({ action: 'cancel', authPub: 'bob', taskId: task.id })).statusCode, 404);
    assert.equal((await request({ action: 'cancel', authPub: 'alice', taskId: task.id,
      signedTaskId: 'different' })).statusCode, 401);
    assert.equal((await request({ action: 'cancel', authPub: 'alice', taskId: task.id,
      signedAction: 'status' })).statusCode, 401);
    assert.equal((await request({ action: 'cancel', authPub: 'alice', taskId: task.id }, '/tasks')).statusCode, 404);
    assert.equal((await request({ action: 'cancel', authPub: 'alice', taskId: task.id })).body.status, 'cancelled');
  });
});

test('client signs cancellation task ID', async () => {
  const client = createHostedPilotClient({
    sign: async (scope, action, fields) => {
      assert.equal(scope, 'hosted-operator-task');
      assert.equal(action, 'cancel');
      assert.deepEqual(fields, { taskId: 'task-123' });
      return { authPub: 'alice', authProof: 'proof' };
    },
    fetchImpl: async (url, init) => {
      assert.equal(JSON.parse(init.body).action, 'cancel');
      return { ok: true, json: async () => ({ status: 'cancelled' }) };
    }
  });
  assert.equal((await client.cancel('task-123')).status, 'cancelled');
});

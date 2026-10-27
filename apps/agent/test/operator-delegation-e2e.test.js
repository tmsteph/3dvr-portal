const test = require('node:test');
const assert = require('node:assert/strict');

const {
  readTask,
  runWorkerOnce,
} = require('../thomas-agent/node/agent-task-queue');

class FakeGunNode {
  constructor(store, nodePath = []) {
    this.store = store;
    this.path = nodePath;
  }

  get(key) {
    return new FakeGunNode(this.store, [...this.path, key]);
  }

  put(payload, callback) {
    this.store.set(this.path.join('/'), payload);
    callback?.({ ok: true });
  }

  once(callback) {
    callback(this.store.get(this.path.join('/')) || null, this.path.at(-1));
  }

  map() {
    const prefix = `${this.path.join('/')}/`;
    return {
      once: callback => {
        for (const [key, value] of this.store.entries()) {
          if (key.startsWith(prefix)) callback(value, key.slice(prefix.length));
        }
      },
    };
  }
}

function fakeRoot() {
  return new FakeGunNode(new Map());
}

function put(node, payload) {
  return new Promise((resolve, reject) => {
    node.put(payload, ack => {
      if (ack?.err) reject(new Error(String(ack.err)));
      else resolve(ack || {});
    });
  });
}

test('legacy GUN Operator delegation stays visible but never executes unsigned intent', async () => {
  const { buildOperatorDelegatedTask } = await import('../../../operator/delegate-task.js');
  const rootNode = fakeRoot();
  const ownerAlias = '3dvr-managed';
  const marker = 'OPERATOR_DELEGATION_E2E_OK';
  const built = buildOperatorDelegatedTask({
    type: 'delegate_task',
    title: 'Operator delegation E2E',
    text: `Return exactly ${marker}. Do not change files or perform external writes.`,
  }, {
    id: 'operator-delegation-e2e',
    now: '2026-09-23T00:00:00.000Z',
    tenantAlias: 'operator-e2e',
  });

  assert.equal(built.record.backend, 'auto');
  assert.equal(built.record.riskClass, 'draft');
  assert.equal(built.record.approvalStatus, 'not_required');
  assert.equal(built.record.requiredCapabilities, 'auto');

  const taskQueue = rootNode.get(ownerAlias).get('taskQueue');
  await Promise.all([
    put(taskQueue.get('tasks').get(built.record.id), built.record),
    put(taskQueue.get('latest').get(built.record.id), built.summary),
    put(taskQueue.get('runtime').get(built.record.id), built.runtime),
  ]);

  let workerArgs = [];
  const processed = await runWorkerOnce({
    rootNode,
    ownerAlias,
    force: true,
    deviceId: 'operator-e2e-worker',
    workerCapabilities: 'auto',
    workerRiskClasses: 'draft',
    runAgentTaskImpl: async args => {
      workerArgs = args;
      return {
        ok: true,
        backend: 'auto',
        result: { stdout: marker },
      };
    },
  });

  assert.deepEqual(processed, [], 'unsigned public GUN tasks are not execution admissions');
  assert.deepEqual(workerArgs, [], 'no backend invocation');
  const finalTask = await readTask(built.record.id, { rootNode, ownerAlias });
  assert.equal(finalTask.status, 'queued');
  assert.ok(!finalTask.workerDeviceId, 'no worker claimed the public task');
  assert.ok(!finalTask.resultSummary, 'no result receipt was fabricated');

  const runtime = rootNode.store.get(`${ownerAlias}/taskQueue/runtime/${built.record.id}`);
  assert.equal(runtime.runtimeState, 'queued');
  assert.equal(runtime.workerLane, 'general');
});

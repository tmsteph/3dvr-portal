const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildTaskArgs,
  enqueueTask,
  formatTask,
  listTasks,
  readTask,
  runWorkerOnce,
  updateTask,
} = require('../thomas-agent/node/agent-task-queue');

class FakeGunNode {
  constructor(store, path = []) {
    this.store = store;
    this.path = path;
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
      once: (callback) => {
        for (const [key, value] of this.store.entries()) {
          if (!key.startsWith(prefix)) continue;
          callback(value, key.slice(prefix.length));
        }
      },
    };
  }
}

function fakeRoot() {
  return new FakeGunNode(new Map());
}

test('enqueueTask writes queued task records and summaries', async () => {
  const rootNode = fakeRoot();
  const record = await enqueueTask('Fix server worker', {
    rootNode,
    ownerAlias: 'tenant-a',
    id: 'task-1',
    backend: 'codex',
    force: true,
  });
  const read = await readTask('task-1', { rootNode, ownerAlias: 'tenant-a' });
  const list = await listTasks({ rootNode, ownerAlias: 'tenant-a' });

  assert.equal(record.status, 'queued');
  assert.equal(read.task, 'Fix server worker');
  assert.equal(list.length, 1);
  assert.equal(list[0].id, 'task-1');
});

test('buildTaskArgs includes execute and only passes unsafe when requested', () => {
  assert.deepEqual(buildTaskArgs({
    task: 'Fix tests',
    backend: 'codex',
    unsafe: false,
  }), ['--backend', 'codex', '--execute', '--no-print-prompt', 'Fix tests']);
  assert.deepEqual(buildTaskArgs({
    task: 'Deploy',
    backend: 'shell',
    unsafe: true,
  }), ['--backend', 'shell', '--execute', '--no-print-prompt', '--unsafe', 'Deploy']);
});

test('updateTask changes status and formatTask renders results', async () => {
  const rootNode = fakeRoot();
  await enqueueTask('Research market', {
    rootNode,
    ownerAlias: 'tenant-a',
    id: 'task-2',
    force: true,
  });
  const updated = await updateTask('task-2', {
    status: 'completed',
    resultSummary: 'done',
  }, {
    rootNode,
    ownerAlias: 'tenant-a',
    force: true,
  });

  assert.equal(updated.status, 'completed');
  assert.match(formatTask(updated), /Result: done/);
});

test('runWorkerOnce claims and executes queued tasks through injected hooks', async () => {
  const rootNode = fakeRoot();
  await enqueueTask('Summarize leads', {
    rootNode,
    ownerAlias: 'tenant-a',
    id: 'task-3',
    backend: 'openai',
    force: true,
  });
  const results = await runWorkerOnce({
    rootNode,
    ownerAlias: 'tenant-a',
    deviceId: 'do-worker',
    force: true,
    runAgentTaskImpl: async () => ({
      ok: true,
      backend: 'openai',
      result: { ok: true, stdout: 'summary' },
    }),
  });
  const completed = await readTask('task-3', { rootNode, ownerAlias: 'tenant-a' });

  assert.equal(results.length, 1);
  assert.equal(completed.status, 'completed');
  assert.match(completed.resultSummary, /summary/);
});

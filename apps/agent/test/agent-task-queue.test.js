const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildTaskArgs,
  canWorkerRunTask,
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
    tenantId: 'google:123',
    tenantAlias: 'builder@example.com',
    tenantPlan: 'builder',
    riskClass: 'workspace_write',
    requiredCapabilities: 'codex,node',
    force: true,
  });
  const read = await readTask('task-1', { rootNode, ownerAlias: 'tenant-a' });
  const list = await listTasks({ rootNode, ownerAlias: 'tenant-a' });

  assert.equal(record.status, 'queued');
  assert.equal(record.tenantId, 'google:123');
  assert.equal(record.tenantAlias, 'builder@example.com');
  assert.equal(record.tenantPlan, 'builder');
  assert.equal(record.riskClass, 'workspace_write');
  assert.equal(record.approvalStatus, 'not_required');
  assert.equal(record.requiredCapabilities, 'codex,node');
  assert.equal(read.task, 'Fix server worker');
  assert.equal(list.length, 1);
  assert.equal(list[0].id, 'task-1');
  assert.equal(list[0].tenantId, 'google:123');
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
  assert.match(formatTask(updated), /Tenant: tenant-a/);
});

test('runWorkerOnce claims and executes queued tasks through injected hooks', async () => {
  const rootNode = fakeRoot();
  await enqueueTask('Summarize leads', {
    rootNode,
    ownerAlias: 'tenant-a',
    id: 'task-3',
    backend: 'openai',
    requiredCapabilities: 'openai',
    force: true,
  });
  const results = await runWorkerOnce({
    rootNode,
    ownerAlias: 'tenant-a',
    deviceId: 'do-worker',
    workerCapabilities: 'node,openai,codex',
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

test('worker skips tasks that need approval or unsupported capabilities', async () => {
  const rootNode = fakeRoot();
  await enqueueTask('Deploy site', {
    rootNode,
    ownerAlias: 'tenant-a',
    id: 'task-4',
    backend: 'codex',
    riskClass: 'external_write',
    force: true,
  });
  await enqueueTask('Research buyer list', {
    rootNode,
    ownerAlias: 'tenant-a',
    id: 'task-5',
    backend: 'openai',
    riskClass: 'read_only',
    requiredCapabilities: 'openai',
    force: true,
  });

  const blocked = await readTask('task-4', { rootNode, ownerAlias: 'tenant-a' });
  const unsupported = await readTask('task-5', { rootNode, ownerAlias: 'tenant-a' });

  assert.equal(blocked.approvalStatus, 'required');
  assert.equal(canWorkerRunTask(blocked, { workerCapabilities: 'node,codex' }).ok, false);
  assert.equal(canWorkerRunTask(unsupported, { workerCapabilities: 'node,codex' }).ok, false);

  const results = await runWorkerOnce({
    rootNode,
    ownerAlias: 'tenant-a',
    deviceId: 'do-worker',
    workerCapabilities: 'node,codex',
    force: true,
    runAgentTaskImpl: async () => {
      throw new Error('should not run');
    },
  });

  assert.equal(results.length, 0);
});

test('unsafe high-risk task is approved and can run on capable worker', async () => {
  const rootNode = fakeRoot();
  await enqueueTask('Publish static site', {
    rootNode,
    ownerAlias: 'tenant-a',
    id: 'task-6',
    backend: 'codex',
    riskClass: 'external_write',
    unsafe: true,
    requiredCapabilities: 'codex,static-hosting',
    force: true,
  });

  const results = await runWorkerOnce({
    rootNode,
    ownerAlias: 'tenant-a',
    deviceId: 'do-worker',
    workerCapabilities: 'node,codex,static-hosting',
    workerRiskClasses: 'read_only,draft,workspace_write,external_write',
    force: true,
    runAgentTaskImpl: async () => ({
      ok: true,
      backend: 'codex',
      result: { ok: true, stdout: 'published' },
    }),
  });
  const completed = await readTask('task-6', { rootNode, ownerAlias: 'tenant-a' });

  assert.equal(results.length, 1);
  assert.equal(completed.approvalStatus, 'approved');
  assert.equal(completed.status, 'completed');
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const {
  enqueueTask,
  publicTask,
  readTask,
  runWorkerOnce,
} = require('../thomas-agent/node/agent-task-queue');
const sqliteQueue = require('../thomas-agent/node/task-queue-sqlite-store');

class FakeGunNode {
  constructor(store, nodePath = []) {
    this.store = store;
    this.path = nodePath;
  }

  get(key) { return new FakeGunNode(this.store, [...this.path, key]); }
  put(payload, callback) { this.store.set(this.path.join('/'), payload); callback?.({ ok: true }); }
  once(callback) { callback(this.store.get(this.path.join('/')) || null, this.path.at(-1)); }
  map() {
    const prefix = `${this.path.join('/')}/`;
    return { once: (callback) => {
      for (const [key, value] of this.store.entries()) {
        if (key.startsWith(prefix)) callback(value, key.slice(prefix.length));
      }
    } };
  }
}

function fakeRoot() { return new FakeGunNode(new Map()); }

async function queueOptions(t, extra = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), '3dvr-sqlite-queue-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return {
    queueStore: 'sqlite',
    queueDb: path.join(dir, 'queue.sqlite'),
    ownerAlias: 'tenant/sqlite:exact',
    force: true,
    ...extra,
  };
}

test('SQLite queue survives reopen and preserves exact owner and task identifiers', async (t) => {
  const options = await queueOptions(t);
  await enqueueTask('first', { ...options, id: 'A/B' });
  await enqueueTask('second', { ...options, id: 'a-b' });

  assert.equal((await readTask('A/B', options)).task, 'first');
  assert.equal((await readTask('a-b', options)).task, 'second');
});

test('concurrent workers atomically claim a SQLite task only once', async (t) => {
  const options = await queueOptions(t, {
    rootNode: fakeRoot(),
    workerCapabilities: 'node,openai',
    deviceId: 'worker',
  });
  await enqueueTask('once', {
    ...options,
    id: 'concurrent-task',
    backend: 'openai',
    requiredCapabilities: 'openai',
  });
  let executions = 0;
  const runAgentTaskImpl = async () => {
    executions += 1;
    await new Promise(resolve => setTimeout(resolve, 30));
    return { ok: true, backend: 'openai', result: { stdout: 'done' } };
  };

  await Promise.all([
    runWorkerOnce({ ...options, runAgentTaskImpl }),
    runWorkerOnce({ ...options, runAgentTaskImpl }),
  ]);

  assert.equal(executions, 1);
  assert.equal((await readTask('concurrent-task', options)).status, 'completed');
});

test('long SQLite work renews a tiny claim lease against a competing worker', async (t) => {
  const options = await queueOptions(t, {
    rootNode: fakeRoot(),
    workerCapabilities: 'openai',
    leaseTtlMs: 15,
  });
  await enqueueTask('slow', { ...options, id: 'slow-task', backend: 'openai' });
  let executions = 0;
  const runAgentTaskImpl = async () => {
    executions += 1;
    await new Promise(resolve => setTimeout(resolve, 80));
    return { ok: true, result: { stdout: 'slow done' } };
  };

  const first = runWorkerOnce({ ...options, deviceId: 'worker-a', runAgentTaskImpl });
  await new Promise(resolve => setTimeout(resolve, 40));
  const competing = await runWorkerOnce({ ...options, deviceId: 'worker-b', runAgentTaskImpl });
  await first;

  assert.equal(executions, 1);
  assert.equal(competing.length, 0);
  assert.equal((await readTask('slow-task', options)).status, 'completed');
});

test('an expired claim is recovered after a worker process restart', async (t) => {
  const now = Date.now();
  const options = await queueOptions(t, {
    rootNode: fakeRoot(),
    workerCapabilities: 'node,openai',
    deviceId: 'replacement-worker',
    now: now + 100,
  });
  await enqueueTask('recover me', {
    ...options,
    now,
    id: 'restart-task',
    backend: 'openai',
    requiredCapabilities: 'openai',
  });
  assert.ok(sqliteQueue.claimTask('restart-task', 'dead-process-token', 'dead-worker', now + 10, now, options));

  let executions = 0;
  await runWorkerOnce({
    ...options,
    runAgentTaskImpl: async () => {
      executions += 1;
      return { ok: true, result: { stdout: 'recovered' } };
    },
  });

  assert.equal(executions, 1);
  assert.equal((await readTask('restart-task', options)).status, 'completed');
});

test('SQLite worker imports legacy GUN tasks and mirrors completion', async (t) => {
  const rootNode = fakeRoot();
  const gunOptions = { rootNode, ownerAlias: 'tenant/sqlite:exact', force: true };
  await enqueueTask('legacy task', {
    ...gunOptions,
    id: 'legacy/GUN:id',
    backend: 'openai',
    requiredCapabilities: 'openai',
  });
  const options = await queueOptions(t, {
    ...gunOptions,
    queueStore: 'sqlite',
    workerCapabilities: 'node,openai',
    deviceId: 'hybrid-worker',
    runAgentTaskImpl: async () => ({ ok: true, result: { stdout: 'legacy done' } }),
  });

  const results = await runWorkerOnce(options);

  assert.equal(results.length, 1);
  assert.equal((await readTask('legacy/GUN:id', gunOptions)).status, 'completed');
  assert.match((await readTask('legacy/GUN:id', options)).resultSummary, /legacy done/);
});

test('newer GUN requeue replaces stale terminal import without being overwritten', async (t) => {
  const rootNode = fakeRoot();
  const gunOptions = { rootNode, ownerAlias: 'tenant/sqlite:exact', force: true };
  const options = await queueOptions(t, {
    ...gunOptions,
    queueStore: 'sqlite',
    workerCapabilities: 'node',
  });
  await enqueueTask('legacy v1', {
    ...gunOptions,
    id: 'retry-task',
    backend: 'openai',
    now: Date.parse('2026-01-01T00:00:00.000Z'),
  });
  await runWorkerOnce(options);
  const imported = await readTask('retry-task', options);
  sqliteQueue.writeTask({
    ...imported,
    status: 'failed',
    updatedAt: '2026-01-02T00:00:00.000Z',
  }, { ...options, queueSource: 'gun' });
  await enqueueTask('legacy v2', {
    ...gunOptions,
    id: 'retry-task',
    backend: 'openai',
    now: Date.parse('2026-01-03T00:00:00.000Z'),
  });

  await runWorkerOnce(options);

  const local = await readTask('retry-task', options);
  const remote = await readTask('retry-task', gunOptions);
  assert.equal(local.status, 'queued');
  assert.equal(local.task, 'legacy v2');
  assert.equal(remote.status, 'queued');
  assert.equal(remote.updatedAt, '2026-01-03T00:00:00.000Z');
});

test('native SQLite terminal tasks mirror to GUN without exposing active states', async (t) => {
  const rootNode = fakeRoot();
  const gunOptions = { rootNode, ownerAlias: 'tenant/sqlite:exact', force: true };
  const options = await queueOptions(t, {
    ...gunOptions,
    queueStore: 'sqlite',
    workerCapabilities: 'openai',
    runAgentTaskImpl: async () => ({ ok: true, result: { stdout: 'native done' } }),
  });
  await enqueueTask('native', { ...options, id: 'native-task', backend: 'openai' });
  assert.equal(await readTask('native-task', gunOptions), null);

  await runWorkerOnce(options);

  assert.equal((await readTask('native-task', gunOptions)).status, 'completed');
});

test('GUN-only import does not load node:sqlite', () => {
  const queueModule = path.join(__dirname, '..', 'thomas-agent', 'node', 'agent-task-queue.js');
  const script = `
    const Module = require('node:module');
    const load = Module._load;
    Module._load = function (request, ...args) {
      if (request === 'node:sqlite') throw new Error('sqlite loaded');
      return load.call(this, request, ...args);
    };
    require(${JSON.stringify(queueModule)});
  `;
  const result = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});

test('public SQLite CLI records omit claim metadata and tokens', async (t) => {
  const options = await queueOptions(t);
  await enqueueTask('private metadata', { ...options, id: 'public-task', backend: 'openai' });
  const now = Date.now();
  assert.ok(sqliteQueue.claimTask('public-task', 'secret-claim-token', 'worker', now + 60_000, now, options));
  const record = publicTask({
    ...await readTask('public-task', options),
    claimToken: 'secret-claim-token',
  });
  assert.equal(record.status, 'running');
  assert.equal('queueSource' in record, false);
  assert.equal('claimExpiresAt' in record, false);
  assert.equal(JSON.stringify(record).includes('secret-claim-token'), false);
});

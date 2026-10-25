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
  runQueuedTask,
  runWorkerOnce,
  updateTask,
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

test('native SQLite terminal tasks cannot be replayed by duplicate IDs or GUN imports', async (t) => {
  const options = await queueOptions(t, {
    rootNode: fakeRoot(),
    gunSync: false,
    workerCapabilities: 'node',
    deviceId: 'native-worker',
  });
  await enqueueTask('health once', { ...options, id: 'native-completed', backend: 'health' });
  const executed = await runWorkerOnce(options);
  assert.equal(executed.length, 1);
  assert.equal((await readTask('native-completed', options)).status, 'completed');

  // A retry with the same durable ID must not silently restart completed work.
  await assert.rejects(
    enqueueTask('run it again', { ...options, id: 'native-completed', backend: 'health' }),
    /active task claim required/,
  );

  // A later GUN mirror must not replace the authoritative SQLite result.
  const imported = sqliteQueue.importTask({
    id: 'native-completed',
    task: 'GUN replay',
    status: 'queued',
    backend: 'health',
    updatedAt: new Date(Date.now() + 60_000).toISOString(),
  }, options);
  assert.equal(imported, false);
  assert.equal((await readTask('native-completed', options)).status, 'completed');
  assert.equal((await readTask('native-completed', options)).task, 'health once');

  // Failed work also needs an explicit reviewed retry, not an ID collision.
  await enqueueTask('failed once', { ...options, id: 'native-failed', backend: 'health' });
  sqliteQueue.writeTask({
    ...await readTask('native-failed', options),
    status: 'failed',
    updatedAt: new Date().toISOString(),
  }, options);
  await assert.rejects(
    enqueueTask('failed replay', { ...options, id: 'native-failed', backend: 'health' }),
    /active task claim required/,
  );
  assert.equal((await readTask('native-failed', options)).status, 'failed');
});

test('GUN-imported terminal tasks cannot be reopened by a newer queued mirror', async (t) => {
  const options = await queueOptions(t);
  const now = Date.now();
  for (const [index, terminal] of ['completed', 'failed', 'skipped'].entries()) {
    const id = `gun-terminal-${terminal}`;
    const initial = {
      id, task: 'Original work', backend: 'health', status: 'queued',
      updatedAt: new Date(now + index).toISOString(),
    };
    assert.equal(sqliteQueue.importTask(initial, options), true);
    // A legitimate GUN status update may finish a still-queued imported row.
    assert.equal(sqliteQueue.importTask({
      ...initial, status: terminal, updatedAt: new Date(now + 1000 + index).toISOString(),
    }, options), true);
    // A stale GUN replica with a newer timestamp must not restart finished work.
    assert.equal(sqliteQueue.importTask({
      ...initial, task: 'Replay external effects', status: 'queued',
      updatedAt: new Date(now + 2000 + index).toISOString(),
    }, options), false);
    const stored = await readTask(id, options);
    assert.equal(stored.status, terminal);
    assert.equal(stored.task, 'Original work');
    assert.equal(stored.queueSource, 'gun');
  }
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

test('stale worker snapshots cannot bypass changed SQLite approval or capability gates', async (t) => {
  const options = await queueOptions(t, {
    workerCapabilities: 'node,openai',
    workerRiskClasses: 'read_only,external_write',
    deviceId: 'worker-a',
    gunSync: false,
  });
  let executions = 0;
  const runAgentTaskImpl = async () => {
    executions += 1;
    return { ok: true, result: { stdout: 'must not run' } };
  };

  for (const [id, patch] of [
    ['revoked-approval', { riskClass: 'external_write', approvalStatus: 'required' }],
    ['raised-capability', { requiredCapabilities: 'openai,private-admin' }],
  ]) {
    await enqueueTask('Review a public example', {
      ...options, id, backend: 'openai', riskClass: 'read_only',
    });
    const staleSnapshot = await readTask(id, options);
    await updateTask(id, patch, options);

    // Simulate another producer changing the row after the worker read it,
    // but before the atomic SQLite claim. The row must remain queued.
    const result = await runQueuedTask(staleSnapshot, { ...options, runAgentTaskImpl });
    const current = await readTask(id, options);
    assert.equal(result.skipped, true, id);
    assert.equal(current.status, 'queued', id);
    assert.equal(current.claimToken, undefined, id);
    assert.equal(current.approvalStatus, patch.approvalStatus || 'not_required', id);
  }
  assert.equal(executions, 0);
});

test('long SQLite work renews an expired initial claim against a competing worker', async (t) => {
  const options = await queueOptions(t, {
    rootNode: fakeRoot(),
    workerCapabilities: 'openai',
    // The old 15 ms lease made this a scheduler lottery under parallel CI load.
    // Keep the competitor beyond the initial lease while leaving several renewal
    // intervals for the worker to prove that the lease really stays alive.
    leaseTtlMs: 200,
  });
  await enqueueTask('slow', { ...options, id: 'slow-task', backend: 'openai' });
  let executions = 0;
  const runAgentTaskImpl = async () => {
    executions += 1;
    await new Promise(resolve => setTimeout(resolve, 650));
    return { ok: true, result: { stdout: 'slow done' } };
  };

  // Attach rejection handling immediately so a genuine lease-loss regression is
  // reported as an assertion instead of an unhandled-rejection timing artifact.
  const first = runWorkerOnce({ ...options, deviceId: 'worker-a', runAgentTaskImpl })
    .then(value => ({ value }), error => ({ error }));
  await new Promise(resolve => setTimeout(resolve, 400));
  const competing = await runWorkerOnce({ ...options, deviceId: 'worker-b', runAgentTaskImpl });
  const firstOutcome = await first;

  assert.ifError(firstOutcome.error);
  assert.equal(executions, 1);
  assert.equal(competing.length, 0);
  assert.equal((await readTask('slow-task', options)).status, 'completed');
});

test('an expired running claim requires review instead of automatic replay', async (t) => {
  const now = Date.now();
  const options = await queueOptions(t, {
    rootNode: fakeRoot(),
    workerCapabilities: 'node,openai',
    deviceId: 'replacement-worker',
    now: now + 100,
  });
  await enqueueTask('potentially side-effectful work', {
    ...options,
    now,
    id: 'restart-task',
    backend: 'openai',
    requiredCapabilities: 'openai',
  });
  assert.ok(sqliteQueue.claimTask('restart-task', 'dead-process-token', 'dead-worker', now + 10, now, options));

  let executions = 0;
  const results = await runWorkerOnce({
    ...options,
    runAgentTaskImpl: async () => {
      executions += 1;
      return { ok: true, result: { stdout: 'should not execute' } };
    },
  });

  assert.equal(executions, 0, 'no automatic replay after a worker crash');
  assert.equal(results.length, 0);
  assert.equal((await readTask('restart-task', options)).status, 'running');
  assert.equal(
    sqliteQueue.claimTask('restart-task', 'replacement-token', 'replacement-worker', now + 200, now + 100, options),
    null,
    'direct SQLite claim also fails closed on an expired running lease',
  );
});

test('newer GUN import cannot revive an expired running task', async (t) => {
  const now = Date.now();
  const options = await queueOptions(t, {
    rootNode: fakeRoot(),
    workerCapabilities: 'openai',
    deviceId: 'replacement-worker',
    now: now + 200,
  });
  await enqueueTask('side effects may already have happened', {
    ...options, id: 'expired-import-task', backend: 'openai', now,
  });
  assert.ok(sqliteQueue.claimTask(
    'expired-import-task', 'original-claim', 'original-worker', now + 10, now, options,
  ));

  // A newer GUN mirror could previously overwrite the expired running row
  // with queued state, bypassing the fail-closed worker claim restriction.
  const imported = sqliteQueue.importTask({
    id: 'expired-import-task',
    status: 'queued',
    task: 'same work, later GUN update',
    backend: 'openai',
    updatedAt: new Date(now + 100).toISOString(),
  }, { ...options, now: now + 200 });
  assert.equal(imported, false, 'expired running work must remain review-only');

  const preserved = await readTask('expired-import-task', options);
  assert.equal(preserved.status, 'running');
  assert.equal(preserved.workerDeviceId, 'original-worker');
  let executions = 0;
  const results = await runWorkerOnce({
    ...options,
    runAgentTaskImpl: async () => {
      executions += 1;
      return { ok: true, result: { stdout: 'must not replay' } };
    },
  });
  assert.equal(executions, 0);
  assert.equal(results.length, 0);
});

test('SQLite enqueue and direct writes cannot revive expired running work', async (t) => {
  const now = Date.now();
  const options = await queueOptions(t, {
    rootNode: fakeRoot(),
    workerCapabilities: 'openai',
    deviceId: 'replacement-worker',
    now: now + 200,
  });
  await enqueueTask('possibly side-effectful task', {
    ...options, id: 'claimed-write-task', backend: 'openai', now,
  });
  assert.ok(sqliteQueue.claimTask(
    'claimed-write-task', 'original-claim', 'original-worker', now + 10, now, options,
  ));

  // Both ordinary enqueue and low-level writeTask previously bypassed the
  // fail-closed claim and GUN-import guards by upserting the running row.
  await assert.rejects(
    enqueueTask('duplicate work', {
      ...options, id: 'claimed-write-task', backend: 'openai', now: now + 100,
    }),
    /active task claim required/,
  );
  assert.throws(() => sqliteQueue.writeTask({
    id: 'claimed-write-task',
    task: 'direct replay',
    status: 'queued',
    backend: 'openai',
    updatedAt: new Date(now + 150).toISOString(),
  }, options), /active task claim required/);

  const preserved = await readTask('claimed-write-task', options);
  assert.equal(preserved.status, 'running');
  assert.equal(preserved.workerDeviceId, 'original-worker');
  let executions = 0;
  const results = await runWorkerOnce({
    ...options,
    runAgentTaskImpl: async () => {
      executions += 1;
      return { ok: true, result: { stdout: 'must not replay' } };
    },
  });
  assert.equal(executions, 0);
  assert.equal(results.length, 0);
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

test('newer GUN requeue cannot replay a failed terminal import', async (t) => {
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
  // The legacy GUN source may still show a retry request, but the durable
  // SQLite execution record must stay terminal until a reviewed new task ID
  // is explicitly authorized. A newer mirror timestamp is not authorization.
  assert.equal(local.status, 'failed');
  assert.equal(local.task, 'legacy v1');
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

test('signed HTTP tasks keep prompts and results out of the public relay and memory', async (t) => {
  const rootNode = fakeRoot();
  const gunOptions = {rootNode, ownerAlias:'tenant/http:private', force:true};
  let lifeEvents = 0;
  const options = await queueOptions(t, {
    ...gunOptions, queueStore:'sqlite', workerCapabilities:'codex',
    runAgentTaskImpl:async () => ({ok:true,result:{stdout:'private result'}}),
    recordLifeEventImpl:async () => {lifeEvents++;}
  });
  const id='operator-http-private-test';
  await enqueueTask('private prompt', {...options,id,backend:'codex'});
  await runWorkerOnce(options);
  assert.equal((await readTask(id,options)).status,'completed');
  assert.equal(await readTask(id,gunOptions),null);
  assert.equal(lifeEvents,0);
  await enqueueTask('forged public replacement', {...gunOptions,id,backend:'codex',now:Date.now()+60000});
  await runWorkerOnce(options);
  const saved=await readTask(id,options);
  assert.equal(saved.status,'completed');
  assert.equal(saved.task,'private prompt');
});

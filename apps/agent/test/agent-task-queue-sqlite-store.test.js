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

test('generic SQLite writers cannot forge, replace, or replay signed HTTP queue rows', async (t) => {
  const options = await queueOptions(t);
  const now = '2026-10-30T00:00:00.000Z';
  const signed = { id: 'operator-http-protected', task: 'read-only synthetic', status: 'queued', updatedAt: now };
  assert.throws(() => sqliteQueue.writeTask(signed, options), /signed queue provenance/i);
  assert.equal(sqliteQueue.readTask(signed.id, options), null);

  sqliteQueue.writeTask(signed, { ...options, queueSource: 'operator-http' });
  const replacement = { ...signed, task: 'unsafe replacement', status: 'queued', updatedAt: '2026-10-30T00:01:00.000Z' };
  assert.throws(() => sqliteQueue.writeTask(replacement, options), /signed queue provenance/i);
  assert.throws(() => sqliteQueue.writeTask(replacement, { ...options, queueSource: 'operator-http' }), /already exists/i);
  await assert.rejects(enqueueTask('replayed by generic CLI', { ...options, id: signed.id }), /signed queue provenance/i);
  const saved = sqliteQueue.readTask(signed.id, options);
  assert.equal(saved.task, signed.task);
  assert.equal(saved.status, 'queued');
  assert.equal(saved.queueSource, 'operator-http');
  // A newer public-relay import must not rewrite the private prompt, result, or provenance.
  assert.equal(sqliteQueue.importTask({ ...replacement, updatedAt: '2026-10-30T00:02:00.000Z' }, options), false);
  const afterImport = sqliteQueue.readTask(signed.id, options);
  assert.equal(afterImport.task, signed.task);
  assert.equal(afterImport.status, 'queued');
  assert.equal(afterImport.queueSource, 'operator-http');

  const collision = { ...signed, id: 'operator-http-legacy-collision' };
  // A public import cannot squat on an as-yet-unallocated signed ID.
  assert.equal(sqliteQueue.importTask(collision, options), false);
  assert.equal(sqliteQueue.readTask(collision.id, options), null);
  sqliteQueue.writeTask(collision, { ...options, queueSource: 'operator-http' });
  assert.equal(sqliteQueue.readTask(collision.id, options).queueSource, 'operator-http');

  const ordinary = { ...signed, id: 'ordinary-task' };
  sqliteQueue.writeTask(ordinary, options);
  sqliteQueue.writeTask({ ...ordinary, task: 'ordinary update' }, options);
  assert.equal(sqliteQueue.readTask(ordinary.id, options).task, 'ordinary update');
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

test('an expired claim is held for review and never replayed after a worker restart', async (t) => {
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

  assert.equal(executions, 0);
  assert.equal((await readTask('restart-task', options)).status, 'running');
  assert.equal(sqliteQueue.claimTask('restart-task', 'new-token', 'replacement-worker', now + 1000, now + 100, options), null);
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
  await enqueueTask('private prompt', {...options,id,backend:'codex',queueSource:'operator-http'});
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

test('private Operator tasks reserve one shared executor across queue loops and owners', async (t) => {
  const options = await queueOptions(t);
  const now = Date.now();
  const one = { id: 'operator-http-owner-a-first', status: 'queued', updatedAt: new Date(now).toISOString() };
  const two = { ...one, id: 'operator-http-owner-b-second' };
  sqliteQueue.writeTask(one, {...options,queueSource:'operator-http'});
  const other = { ...options, ownerAlias: 'other-owner' };
  sqliteQueue.writeTask(two, {...other,queueSource:'operator-http'});
  const first = sqliteQueue.claimTask(one.id, 'claim-one', 'worker-a', now + 60000, now, options);
  assert.ok(first);
  assert.equal(sqliteQueue.claimTask(two.id, 'claim-two', 'worker-b', now + 60000, now, other), null);
  assert.equal(sqliteQueue.readTask(two.id, other).status, 'queued');
  assert.ok(sqliteQueue.finishTask(one.id, 'claim-one', { ...one, status: 'completed' }, options));
  assert.ok(sqliteQueue.claimTask(two.id, 'claim-two', 'worker-b', now + 60000, now, other));
});

test('private executor allows a new task after lease expiry without replaying the old claim', async (t) => {
  const options = await queueOptions(t);
  const now = Date.now();
  const a = { id: 'operator-http-first', status: 'queued', updatedAt: new Date(now).toISOString() };
  const b = { ...a, id: 'operator-http-second' };
  const ordinary = { ...a, id: 'ordinary-task' };
  for (const record of [a, b, ordinary]) sqliteQueue.writeTask(record, record.id.startsWith('operator-http-') ? {...options,queueSource:'operator-http'} : options);
  assert.ok(sqliteQueue.claimTask(a.id, 'a', 'worker', now + 10, now, options));
  assert.ok(sqliteQueue.claimTask(ordinary.id, 'ordinary', 'worker', now + 60000, now, options));
  assert.ok(sqliteQueue.claimTask(b.id, 'b', 'worker', now + 60000, now + 11, options));
  assert.equal(sqliteQueue.claimTask(a.id, 'retry-a', 'worker', now + 60000, now + 11, options), null);
  assert.equal(sqliteQueue.readTask(a.id, options).status, 'running');
});

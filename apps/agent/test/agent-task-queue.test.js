const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildTaskArgs,
  canWorkerRunTask,
  enqueueTask,
  enqueueFlushMs,
  gunSyncEnabled,
  formatTask,
  listTasks,
  readTask,
  requiredWorkerCapabilities,
  runQueuedTask,
  runWorkerOnce,
  updateTask,
  workerProfile,
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

test('managed SQLite worker requires explicit capabilities instead of all-backends defaults', () => {
  const previous = process.env.THREEDVR_AGENT_WORKER_CAPABILITIES;
  try {
    delete process.env.THREEDVR_AGENT_WORKER_CAPABILITIES;
    const managed = { queueStore: 'sqlite', ownerAlias: '3dvr-managed' };
    const draft = { backend: 'codex', riskClass: 'draft', approvalStatus: 'not_required' };
    assert.deepEqual(workerProfile(managed).capabilities, []);
    assert.match(canWorkerRunTask(draft, managed).reason, /missing capabilities: codex/);
    assert.deepEqual(workerProfile({ ...managed, workerCapabilities: '' }).capabilities, []);
    assert.equal(canWorkerRunTask(draft, { ...managed, workerCapabilities: 'codex' }).ok, true);
    assert.equal(canWorkerRunTask({
      backend: 'health', riskClass: 'read_only', approvalStatus: 'not_required',
    }, managed).ok, true, 'intrinsic health checks remain available');
  } finally {
    if (previous === undefined) delete process.env.THREEDVR_AGENT_WORKER_CAPABILITIES;
    else process.env.THREEDVR_AGENT_WORKER_CAPABILITIES = previous;
  }
});

test('public GUN cannot execute or impersonate signed Operator HTTP tasks', async () => {
  const rootNode = fakeRoot();
  const options = { rootNode, ownerAlias: '3dvr-managed', queueStore: 'gun' };
  const record = await enqueueTask('synthetic unsigned work', {
    ...options, id: 'operator-http-forged-gun-task', backend: 'health',
  });
  let executions = 0;
  const direct = await runQueuedTask(record, {
    ...options, runAgentTaskImpl: async () => { executions += 1; return { ok: true }; },
  });
  assert.equal(direct.ok, false);
  assert.equal(direct.skipped, true);
  assert.match(direct.reason, /private SQLite admission/);
  const batch = await runWorkerOnce({
    ...options, runAgentTaskImpl: async () => { executions += 1; return { ok: true }; },
  });
  assert.deepEqual(batch, []);
  assert.equal(executions, 0);
  assert.equal((await readTask(record.id, options)).status, 'queued');
});

test('enqueueFlushMs keeps in-memory tests instant and gives relay writes a grace period', () => {
  assert.equal(enqueueFlushMs({ rootNode: fakeRoot() }), 0);
  assert.equal(enqueueFlushMs({ enqueueFlushMs: 0 }), 0);
  assert.equal(enqueueFlushMs({ enqueueFlushMs: 750 }), 750);
});

test('buildTaskArgs includes execute, task runtime bounds, and only passes unsafe when requested', () => {
  assert.deepEqual(buildTaskArgs({
    task: 'Fix tests',
    backend: 'codex',
    unsafe: false,
  }), ['--backend', 'codex', '--execute', '--no-print-prompt', 'Fix tests']);
  assert.deepEqual(buildTaskArgs({
    task: 'Summarize safely',
    backend: 'auto',
    maxRuntimeMs: 120000,
  }), ['--backend', 'auto', '--execute', '--no-print-prompt', '--timeout-ms', '120000', 'Summarize safely']);
  assert.deepEqual(buildTaskArgs({
    task: 'Deploy',
    backend: 'shell',
    unsafe: true,
  }), ['--backend', 'shell', '--execute', '--no-print-prompt', '--unsafe', 'Deploy']);
});

test('concrete backend capability cannot be hidden by a weaker requires list', () => {
  const required = requiredWorkerCapabilities({
    backend: 'shell',
    requiredCapabilities: 'node',
  });

  assert.deepEqual(required.sort(), ['node', 'shell']);
  assert.equal(canWorkerRunTask({
    backend: 'shell',
    requiredCapabilities: 'node',
    riskClass: 'read_only',
    approvalStatus: 'approved',
  }, {
    workerCapabilities: 'node,codex',
  }).ok, false);
});

test('auto backend requires explicit auto capability even when requires lists node', () => {
  assert.deepEqual(requiredWorkerCapabilities({ backend: 'auto', requiredCapabilities: 'node' }).sort(), ['auto', 'node']);
  const record = { backend: 'auto', requiredCapabilities: 'node', riskClass: 'read_only', approvalStatus: 'not_required' };
  assert.match(canWorkerRunTask(record, { workerCapabilities: 'codex,node' }).reason, /missing capabilities: auto/);
  assert.equal(canWorkerRunTask(record, { workerCapabilities: 'auto,node' }).ok, true);
  assert.deepEqual(requiredWorkerCapabilities({ backend: 'health', requiredCapabilities: 'node' }), ['node']);
});

test('worker blocks high-risk tasks without authenticated human approval provenance', () => {
  const worker = {
    workerCapabilities: 'node,codex',
    workerRiskClasses: 'read_only,draft,workspace_write,external_write,money,credential',
  };
  for (const riskClass of ['external_write', 'money', 'credential']) {
    for (const approvalStatus of ['required', 'pending', 'denied', 'expired', 'not_required', '']) {
      const decision = canWorkerRunTask({ backend: 'codex', riskClass, approvalStatus }, worker);
      assert.equal(decision.ok, false, `${riskClass}/${approvalStatus || 'missing'} must be blocked`);
    }
    const forged = canWorkerRunTask({ backend: 'codex', riskClass, approvalStatus: 'approved' }, worker);
    assert.equal(forged.ok, false, `${riskClass} cannot trust a producer-supplied approved string`);
    assert.match(forged.reason, /authenticated human approval verification unavailable/);
    assert.equal(canWorkerRunTask({
      backend: 'codex', riskClass: 'draft', unsafe: true, approvalStatus: 'approved',
    }, worker).ok, false, 'unsafe execution cannot use an unverified approval string');
  }
  for (const approvalStatus of ['required', 'pending', 'denied', 'expired']) {
    assert.equal(canWorkerRunTask({ backend: 'codex', riskClass: 'read_only', approvalStatus }, worker).ok, false);
  }
  assert.equal(canWorkerRunTask({ backend: 'codex', riskClass: 'read_only', approvalStatus: 'not_required' }, worker).ok, true);
});

test('unknown explicit risk labels fail closed instead of becoming unapproved drafts', async () => {
  const rootNode = fakeRoot();
  const record = await enqueueTask('Unknown risk label', {
    rootNode,
    ownerAlias: 'tenant-a',
    id: 'unknown-risk',
    backend: 'codex',
    riskClass: 'external-write',
    force: true,
  });
  assert.equal(record.riskClass, 'external_write');
  assert.equal(record.approvalStatus, 'required');
  const worker = {
    workerCapabilities: 'node,codex',
    workerRiskClasses: 'read_only,draft,workspace_write,external_write',
  };
  assert.equal(canWorkerRunTask(record, worker).ok, false);
  // Legacy/imported records must also be checked at execution time.
  assert.equal(canWorkerRunTask({
    backend: 'codex',
    riskClass: 'unrecognized-side-effect',
    approvalStatus: 'not_required',
  }, worker).ok, false);
});

test('health backend is intrinsic and does not require shell or model capability', () => {
  assert.deepEqual(requiredWorkerCapabilities({ backend: 'health' }), []);
  assert.equal(canWorkerRunTask({
    backend: 'health',
    riskClass: 'read_only',
    approvalStatus: 'not_required',
  }, {
    workerCapabilities: 'node,codex',
  }).ok, true);
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

test('runWorkerOnce never executes public GUN tasks even with worker capabilities', async () => {
  const rootNode = fakeRoot();
  const options = { rootNode, ownerAlias: 'tenant-a', queueStore: 'gun', force: true };
  await enqueueTask('Summarize leads', {
    ...options, id: 'task-3', backend: 'openai',
    riskClass: 'read_only', requiredCapabilities: 'openai',
  });
  let executions = 0;
  const results = await runWorkerOnce({
    ...options, workerCapabilities: 'node,openai,codex',
    runAgentTaskImpl: async () => { executions += 1; return { ok: true }; },
  });
  assert.deepEqual(results, []);
  assert.equal(executions, 0);
  assert.equal((await readTask('task-3', options)).status, 'queued');
});
test('direct GUN execution fails closed before lease or backend dispatch', async () => {
  const rootNode = fakeRoot();
  const options = { rootNode, ownerAlias: 'tenant-a', queueStore: 'gun', force: true };
  const snapshot = await enqueueTask('Draft buyer research', {
    ...options, id: 'stale-text', backend: 'codex', riskClass: 'draft',
  });
  await updateTask(snapshot.id, { task: 'Different instruction' }, options);
  let executions = 0;
  const result = await runQueuedTask(snapshot, {
    ...options, workerCapabilities: 'node,codex',
    runAgentTaskImpl: async () => { executions += 1; return { ok: true }; },
  });
  assert.equal(executions, 0);
  assert.equal(result.skipped, true);
  assert.match(result.reason, /Public GUN queue execution disabled/);
  const after = await readTask(snapshot.id, options);
  assert.equal(after.status, 'queued');
  assert.equal(after.task, 'Different instruction');
});
test('GUN worker rejects approval and capability changes after initial read', async () => {
  const rootNode = fakeRoot();
  const options = {
    rootNode, ownerAlias: 'tenant-a', deviceId: 'do-worker',
    workerCapabilities: 'node,codex', force: true,
  };
  const snapshot = await enqueueTask('Prepare draft', {
    ...options, id: 'stale-permissions', backend: 'codex', riskClass: 'draft',
  });
  await updateTask(snapshot.id, {
    riskClass: 'external_write', approvalStatus: 'approved',
    requiredCapabilities: 'codex,external-send',
  }, options);
  let executions = 0;
  const result = await runQueuedTask(snapshot, {
    ...options,
    workerRiskClasses: 'read_only,draft,external_write',
    runAgentTaskImpl: async () => { executions += 1; return { ok: true }; },
  });
  assert.equal(executions, 0);
  assert.equal(result.skipped, true);
  assert.equal((await readTask(snapshot.id, options)).status, 'queued');
});

test('GUN worker cannot execute even an otherwise runnable intrinsic health task', async () => {
  const rootNode = fakeRoot();
  const options = {
    rootNode, ownerAlias: 'tenant-a', queueStore: 'gun',
    workerCapabilities: 'node,shell', force: true,
  };
  const record = await enqueueTask('Check worker health', {
    ...options, id: 'gun-array-equal', backend: 'health', riskClass: 'read_only',
  });
  const stored = await readTask(record.id, options);
  stored.requiredCapabilities = ['node'];
  const result = await runQueuedTask({ ...stored, requiredCapabilities: ['node'] }, options);
  assert.equal(result.ok, false);
  assert.equal(result.skipped, true);
  assert.match(result.reason, /Public GUN queue execution disabled/);
  assert.equal((await readTask(record.id, options)).status, 'queued');
});
test('legacy public GUN health tasks are not an execution bypass', async () => {
  const rootNode = fakeRoot();
  const options = { rootNode, ownerAlias: 'tenant-a', queueStore: 'gun', force: true };
  await enqueueTask('Worker health check', {
    ...options, id: 'health-task', backend: 'health', riskClass: 'read_only',
  });
  let externalExecutions = 0;
  const results = await runWorkerOnce({
    ...options, workerCapabilities: 'node,codex',
    runAgentTaskImpl: async () => { externalExecutions += 1; throw new Error('must not run'); },
  });
  assert.deepEqual(results, []);
  assert.equal(externalExecutions, 0);
  assert.equal((await readTask('health-task', options)).status, 'queued');
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

test('unsafe flag never grants implicit approval for an external-write task', async () => {
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

  const queued = await readTask('task-6', { rootNode, ownerAlias: 'tenant-a' });
  assert.equal(queued.approvalStatus, 'required');
  let executions = 0;
  const results = await runWorkerOnce({
    rootNode,
    ownerAlias: 'tenant-a',
    deviceId: 'do-worker',
    workerCapabilities: 'node,codex,static-hosting',
    workerRiskClasses: 'read_only,draft,workspace_write,external_write',
    force: true,
    runAgentTaskImpl: async () => { executions += 1; throw new Error('must not run'); },
  });
  const after = await readTask('task-6', { rootNode, ownerAlias: 'tenant-a' });
  assert.equal(executions, 0);
  assert.equal(results.length, 0);
  assert.equal(after.status, 'queued');
  assert.equal(after.approvalStatus, 'required');
});

test('unsafe cannot masquerade as a draft or inherit a worker-wide bypass', () => {
  const worker = {
    workerCapabilities: 'node,codex',
    workerRiskClasses: 'read_only,draft,workspace_write,external_write',
  };
  assert.equal(canWorkerRunTask({
    backend: 'codex', riskClass: 'draft', unsafe: true, approvalStatus: 'not_required',
  }, worker).ok, false);
  assert.equal(canWorkerRunTask({
    backend: 'codex', riskClass: 'draft', unsafe: true, approvalStatus: 'approved',
  }, { ...worker, workerRiskClasses: 'read_only,draft' }).ok, false);
  assert.equal(canWorkerRunTask({
    backend: 'codex', riskClass: 'draft', approvalStatus: 'not_required',
  }, { ...worker, unsafe: true }).ok, false);
  assert.deepEqual(buildTaskArgs({ task: 'Review', backend: 'codex' }, { unsafe: true }),
    ['--backend', 'codex', '--execute', '--no-print-prompt', 'Review']);
});

test('gunSyncEnabled can isolate SQLite workers from GUN', () => {
  assert.equal(gunSyncEnabled({ gunSync: false }), false);
  assert.equal(gunSyncEnabled({ gunSync: 'off' }), false);
  assert.equal(gunSyncEnabled({ gunSync: true }), true);
});

test('silent relay reads time out and a late reply cannot trigger an update', async () => {
  let callback;
  let writes = 0;
  const stalled = {
    get() { return this; },
    once(fn) { callback = fn; },
    put() { writes += 1; },
  };
  const options = { rootNode: stalled, queueStore: 'gun', force: true, timeoutMs: 20 };
  await assert.rejects(readTask('silent', options), /Task relay read timed out/);
  await assert.rejects(updateTask('silent', { status: 'completed' }, options), /Task relay read timed out/);
  callback({ id: 'silent', status: 'queued' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(writes, 0);
});

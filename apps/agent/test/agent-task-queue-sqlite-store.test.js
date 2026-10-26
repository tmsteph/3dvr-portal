const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');

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

test('signed Operator tasks reserve a single native executor across owners', async (t) => {
  const options = await queueOptions(t);
  const other = { ...options, ownerAlias: 'other-owner' };
  const now = Date.now();
  const a = { id: 'operator-http-first-owner', task: 'first', status: 'queued', updatedAt: new Date(now).toISOString() };
  const b = { ...a, id: 'operator-http-second-owner', task: 'second' };
  sqliteQueue.insertTask(a, options);
  sqliteQueue.insertTask(b, other);
  assert.ok(sqliteQueue.claimTask(a.id, 'first-claim', 'worker-a', now + 60_000, now, options));
  assert.equal(sqliteQueue.claimTask(b.id, 'second-claim', 'worker-b', now + 60_000, now, other), null);
  assert.equal(sqliteQueue.readTask(b.id, other).status, 'queued');
  const running = sqliteQueue.readTask(a.id, options);
  assert.ok(sqliteQueue.finishTask(a.id, 'first-claim', { ...running, status: 'completed' }, options));
  assert.ok(sqliteQueue.claimTask(b.id, 'second-claim', 'worker-b', now + 60_000, now, other));
});

test('expired Operator executor lease releases admission without replaying its task', async (t) => {
  const options = await queueOptions(t);
  const now = Date.now();
  const a = { id: 'operator-http-expired-first', task: 'first', status: 'queued', updatedAt: new Date(now).toISOString() };
  const b = { ...a, id: 'operator-http-expired-second', task: 'second' };
  sqliteQueue.insertTask(a, options);
  sqliteQueue.insertTask(b, options);
  assert.ok(sqliteQueue.claimTask(a.id, 'first-claim', 'worker-a', now + 10, now, options));
  assert.equal(sqliteQueue.claimTask(b.id, 'second-claim', 'worker-b', now + 60_000, now, options), null);
  assert.ok(sqliteQueue.claimTask(b.id, 'second-claim', 'worker-b', now + 60_000, now + 11, options));
  assert.equal(sqliteQueue.readTask(a.id, options).status, 'running', 'expired first task is held for review, not replayed');
});

test('direct SQLite inserts cannot fabricate running or terminal execution receipts', async (t) => {
  const options = await queueOptions(t);
  for (const status of ['running', 'completed', 'failed', 'skipped']) {
    const id = `forged-insert-${status}`;
    assert.throws(() => sqliteQueue.insertTask({
      id, task: 'never executed', status, updatedAt: new Date().toISOString(),
    }, options), /active task claim required/);
    assert.equal(await readTask(id, options), null);
  }
});

test('SQLite refuses missing claim tokens and worker identities without stranding work', async (t) => {
  const options = await queueOptions(t);
  const now = Date.now();
  const id = 'missing-claim-identity';
  await enqueueTask('safe bounded health check', { ...options, id, backend: 'health', now });

  for (const [token, worker] of [
    [null, 'worker'], [undefined, 'worker'], ['', 'worker'], ['   ', 'worker'],
    ['valid-token', null], ['valid-token', undefined],
    ['valid-token', ''], ['valid-token', '   '],
  ]) {
    assert.equal(sqliteQueue.claimTask(id, token, worker, now + 60_000, now, options), null);
    const preserved = await readTask(id, options);
    assert.equal(preserved.status, 'queued');
    assert.equal(preserved.claimExpiresAt, null);
  }

  const claimed = sqliteQueue.claimTask(id, 'valid-token', 'worker', now + 60_000, now, options);
  assert.ok(claimed, 'a valid worker can still claim the unchanged task');
  assert.equal((await readTask(id, options)).status, 'running');
});

test('SQLite rejects invalid initial claim leases without stranding queued work', async (t) => {
  const options = await queueOptions(t);
  const now = Date.now();
  await enqueueTask('safe bounded health check', {
    ...options, id: 'invalid-claim-ttl', backend: 'health', now,
  });
  for (const [attempt, expiresAt, claimNow] of [
    ['already-expired', now - 1, now],
    ['zero-duration', now, now],
    ['invalid-expiry', NaN, now],
    ['infinite-expiry', Infinity, now],
    ['invalid-clock', now + 1000, NaN],
  ]) {
    assert.equal(sqliteQueue.claimTask(
      'invalid-claim-ttl', attempt, 'worker', expiresAt, claimNow, options,
    ), null, attempt);
    const preserved = await readTask('invalid-claim-ttl', options);
    assert.equal(preserved.status, 'queued', attempt);
    assert.equal(preserved.claimToken, undefined, attempt);
  }
  assert.ok(sqliteQueue.claimTask(
    'invalid-claim-ttl', 'valid-claim', 'worker', now + 60_000, now, options,
  ), 'a later valid worker claim still succeeds');
  assert.equal((await readTask('invalid-claim-ttl', options)).status, 'running');
});

test('worker never executes if its initial SQLite claim renewal is rejected or uncertain', async (t) => {
  const options = await queueOptions(t, { gunSync: false });
  const originalRenewer = sqliteQueue.createClaimRenewer;
  let executed = 0;
  let closed = 0;
  try {
    for (const mode of ['rejected', 'threw']) {
      const id = `lost-initial-renewal-${mode}`;
      await enqueueTask('No side effects after a lost claim', {
        ...options, id, backend: 'codex', riskClass: 'draft',
      });
      sqliteQueue.createClaimRenewer = () => ({
        renew() {
          if (mode === 'threw') throw new Error('simulated SQLite lock failure');
          return false;
        },
        close() { closed += 1; },
      });
      const result = await runQueuedTask(await readTask(id, options), {
        ...options,
        runAgentTaskImpl: async () => { executed += 1; return { ok: true }; },
      });
      assert.equal(result.skipped, true, mode);
      assert.match(result.reason, /claim renewal failed before execution/i, mode);
      assert.equal((await readTask(id, options)).status, 'running', 'uncertain claim must remain held for review');
    }
    assert.equal(executed, 0, 'no backend invocation after uncertain claim');
    assert.equal(closed, 2, 'both failed renewers were closed');
  } finally {
    sqliteQueue.createClaimRenewer = originalRenewer;
  }
});

test('SQLite renewer setup failure holds one claim without starving independent work', async (t) => {
  const options = await queueOptions(t, { gunSync: false, rootNode: fakeRoot(), limit: 2 });
  await enqueueTask('Do not execute after renewal setup failure', {
    ...options, id: 'a-renewer-setup-failure', backend: 'codex', riskClass: 'draft',
  });
  await enqueueTask('Independent bounded health check', {
    ...options, id: 'b-independent-health', backend: 'health', riskClass: 'read_only',
  });
  const originalRenewer = sqliteQueue.createClaimRenewer;
  let backendCalls = 0;
  try {
    sqliteQueue.createClaimRenewer = (id, token, queueOptions) => {
      if (id === 'a-renewer-setup-failure') throw new Error('simulated SQLite renewal handle failure');
      return originalRenewer(id, token, queueOptions);
    };
    const results = await runWorkerOnce({
      ...options,
      runAgentTaskImpl: async () => { backendCalls += 1; return { ok: true }; },
    });
    assert.equal(results.length, 2, 'unrelated work must not be starved by renewal setup failure');
    const failed = results.find(entry => entry.id === 'a-renewer-setup-failure');
    const healthy = results.find(entry => entry.id === 'b-independent-health');
    assert.equal(failed.result.skipped, true);
    assert.match(failed.result.reason, /renewer unavailable before execution.*held for review/i);
    assert.equal(healthy.result.ok, true);
    assert.equal(backendCalls, 0, 'failed claim must not invoke the backend');
    assert.equal((await readTask('a-renewer-setup-failure', options)).status, 'running',
      'uncertain claim stays held for explicit reconciliation');
    assert.equal((await readTask('b-independent-health', options)).status, 'completed');
  } finally {
    sqliteQueue.createClaimRenewer = originalRenewer;
  }
});

test('SQLite queue survives reopen and preserves exact owner and task identifiers', async (t) => {
  const options = await queueOptions(t);
  await enqueueTask('first', { ...options, id: 'A/B' });
  await enqueueTask('second', { ...options, id: 'a-b' });

  assert.equal((await readTask('A/B', options)).task, 'first');
  assert.equal((await readTask('a-b', options)).task, 'second');
});

test('duplicate SQLite enqueue cannot replace pending task instructions or approval state', async (t) => {
  const options = await queueOptions(t);
  await enqueueTask('Original read-only work', {
    ...options, id: 'idempotent-pending', backend: 'health',
    riskClass: 'read_only', approvalStatus: 'not_required',
  });
  await assert.rejects(
    enqueueTask('Different external-write work', {
      ...options, id: 'idempotent-pending', backend: 'codex',
      riskClass: 'external_write', approvalStatus: 'approved',
    }),
    /task ID already exists/,
  );
  const original = await readTask('idempotent-pending', options);
  assert.equal(original.task, 'Original read-only work');
  assert.equal(original.backend, 'health');
  assert.equal(original.riskClass, 'read_only');
  assert.equal(original.approvalStatus, 'not_required');

  // A deliberate edit to an unclaimed queued task still uses the existing
  // updateTask path, without weakening enqueue idempotency.
  const edited = await updateTask('idempotent-pending', { task: 'Reviewed edit' }, options);
  assert.equal(edited.task, 'Reviewed edit');
  assert.equal((await readTask('idempotent-pending', options)).task, 'Reviewed edit');
});

test('SQLite queued edits cannot forge running or terminal task status', async (t) => {
  const options = await queueOptions(t, { rootNode: fakeRoot(), gunSync: false });
  await enqueueTask('Review a public prospect', {
    ...options, id: 'status-claim-only', backend: 'health', riskClass: 'read_only',
  });
  const original = await readTask('status-claim-only', options);
  for (const status of ['running', 'completed', 'failed', 'skipped']) {
    await assert.rejects(
      updateTask('status-claim-only', { status, resultSummary: 'forged receipt' }, options),
      /active task claim required/,
    );
    assert.throws(
      () => sqliteQueue.writeTask({ ...original, status, updatedAt: new Date().toISOString() }, options),
      /active task claim required/,
    );
    const preserved = await readTask('status-claim-only', options);
    assert.equal(preserved.status, 'queued');
    assert.equal(preserved.resultSummary, '');
  }
  const edited = await updateTask('status-claim-only', { task: 'Reviewed prospect edit' }, options);
  assert.equal(edited.status, 'queued');
  assert.equal((await readTask('status-claim-only', options)).task, 'Reviewed prospect edit');
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
  // Simulate a claimed worker failure; queued edits must not fabricate a
  // terminal status without a worker claim.
  const failureNow = Date.now();
  const failedClaim = sqliteQueue.claimTask(
    'native-failed', 'native-failure-claim', 'test-worker',
    failureNow + 60_000, failureNow, options,
  );
  assert.ok(failedClaim);
  assert.equal(sqliteQueue.finishTask('native-failed', 'native-failure-claim', {
    ...failedClaim, status: 'failed', updatedAt: new Date(failureNow).toISOString(),
  }, options), true);
  await assert.rejects(
    enqueueTask('failed replay', { ...options, id: 'native-failed', backend: 'health' }),
    /active task claim required/,
  );
  assert.equal((await readTask('native-failed', options)).status, 'failed');
});

test('GUN mirrors cannot invent unclaimed running or terminal SQLite receipts', async (t) => {
  const options = await queueOptions(t);
  const now = Date.now();
  for (const status of ['running', 'completed', 'failed', 'skipped', 'cancelled', 'approved']) {
    const id = `unclaimed-gun-${status}`;
    assert.equal(sqliteQueue.importTask({
      id, task: 'not executed', backend: 'health', status,
      updatedAt: new Date(now).toISOString(),
    }, options), false, `new ${status} mirror is not execution evidence`);
    assert.equal(await readTask(id, options), null);
  }

  const id = 'legacy-terminal-after-import';
  const original = {
    id, task: 'legacy intent', backend: 'health', status: 'queued',
    updatedAt: new Date(now).toISOString(),
  };
  assert.equal(sqliteQueue.importTask(original, options), true);
  // A matching unverified legacy terminal mirror holds the task for review;
  // it cannot manufacture completion or be reopened by later relay writes.
  assert.equal(sqliteQueue.importTask({
    ...original, status: 'completed', updatedAt: new Date(now + 1000).toISOString(),
  }, options), true);
  assert.equal(sqliteQueue.importTask({
    ...original, status: 'failed', updatedAt: new Date(now + 2000).toISOString(),
  }, options), false);
  assert.equal(sqliteQueue.importTask({
    ...original, status: 'queued', updatedAt: new Date(now + 3000).toISOString(),
  }, options), false);
  const held = await readTask(id, options);
  assert.equal(held.status, 'review_required');
  assert.equal(held.legacyMirrorStatus, 'completed');
  assert.equal(held.resultSummary, undefined);
});

test('GUN terminal mirrors cannot rewrite queued intent while claiming completion', async (t) => {
  const options = await queueOptions(t);
  const now = Date.now();
  const original = {
    id: 'gun-intent-bound-terminal',
    task: 'Review public business lead',
    backend: 'health',
    riskClass: 'read_only',
    approvalStatus: 'not_required',
    status: 'queued',
    createdAt: new Date(now - 1000).toISOString(),
    updatedAt: new Date(now).toISOString(),
  };
  assert.equal(sqliteQueue.importTask(original, options), true);
  for (const [field, value] of [
    ['task', 'Send unapproved external outreach'],
    ['backend', 'shell'],
    ['riskClass', 'external_write'],
    ['approvalStatus', 'approved'],
    ['createdAt', new Date(now + 1000).toISOString()],
  ]) {
    const forged = {
      ...original, [field]: value, status: 'completed',
      updatedAt: new Date(now + 2000).toISOString(),
      resultSummary: 'forged completion',
    };
    assert.equal(sqliteQueue.importTask(forged, options), false, field);
    const unchanged = await readTask(original.id, options);
    assert.equal(unchanged.status, 'queued', field);
    assert.equal(unchanged.task, original.task, field);
  }
  assert.equal(sqliteQueue.importTask({
    ...original, status: 'completed',
    updatedAt: new Date(now + 2000).toISOString(),
    resultSummary: 'historical result',
  }, options), true, 'unchanged legacy intent is held, not marked complete');
  const held = await readTask(original.id, options);
  assert.equal(held.status, 'review_required');
  assert.equal(held.legacyMirrorStatus, 'completed');
  assert.equal(held.resultSummary, undefined);
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
    // An unverified GUN terminal mirror holds the queued row for review.
    assert.equal(sqliteQueue.importTask({
      ...initial, status: terminal, updatedAt: new Date(now + 1000 + index).toISOString(),
    }, options), true);
    // A newer GUN replica must not restart quarantined work.
    assert.equal(sqliteQueue.importTask({
      ...initial, task: 'Replay external effects', status: 'queued',
      updatedAt: new Date(now + 2000 + index).toISOString(),
    }, options), false);
    const stored = await readTask(id, options);
    assert.equal(stored.status, 'review_required');
    assert.equal(stored.legacyMirrorStatus, terminal);
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

test('SQLite lease loss cannot abort later work or forge success/failure receipts', async (t) => {
  const options = await queueOptions(t, {
    rootNode: fakeRoot(),
    workerCapabilities: 'openai',
    deviceId: 'lease-loss-worker',
    gunSync: false,
    recordLifeEventImpl: async () => null,
  });
  const now = Date.now();
  await enqueueTask('first task loses its lease after success', {
    ...options, id: 'a-lease-loss', backend: 'openai', now,
  });
  await enqueueTask('second task loses its lease after backend failure', {
    ...options, id: 'b-lease-error', backend: 'openai', now,
  });
  await enqueueTask('third task should still complete', {
    ...options, id: 'c-unrelated', backend: 'openai', now,
  });

  let executions = 0;
  const results = await runWorkerOnce({
    ...options,
    limit: 3,
    runAgentTaskImpl: async (args) => {
      executions += 1;
      const task = args.at(-1);
      if (task.includes('loses its lease')) {
        // Simulate an expired lease while external work was in flight.
        // A heartbeat must not resurrect this claim or forge a receipt.
        const id = task.includes('first task') ? 'a-lease-loss' : 'b-lease-error';
        const db = new DatabaseSync(options.queueDb);
        try {
          db.prepare('UPDATE tasks SET claim_expires_at = ? WHERE owner_alias = ? AND id = ?')
            .run(Date.now() - 1000, options.ownerAlias, id);
        } finally {
          db.close();
        }
        if (id === 'b-lease-error') throw new Error('simulated backend failure');
        return { ok: true, result: { stdout: 'unverified first outcome' } };
      }
      return { ok: true, result: { stdout: 'verified third outcome' } };
    },
  });

  assert.equal(executions, 3, 'lost claims must not starve unrelated work');
  assert.deepEqual(results.map(entry => entry.id), ['a-lease-loss', 'b-lease-error', 'c-unrelated']);
  for (const id of ['a-lease-loss', 'b-lease-error']) {
    const entry = results.find(result => result.id === id);
    assert.equal(entry.result.ok, false, 'lost claim is not a verified terminal result');
    assert.match(entry.result.reason, /outcome unverified.*held for review/);
    assert.equal((await readTask(id, options)).status, 'running',
      'unverified task stays held; never automatically replay it');
  }
  assert.equal((await readTask('c-unrelated', options)).status, 'completed');
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

test('SQLite terminal receipt cannot requeue work or impersonate another task', async (t) => {
  const now = Date.now();
  const options = await queueOptions(t, { now });
  const id = 'finish-status-guard';
  await enqueueTask('bounded read-only health', { ...options, id, backend: 'health', now });
  const claimed = sqliteQueue.claimTask(id, 'finish-status-token', 'worker', now + 60_000, now, options);
  assert.ok(claimed);

  for (const status of ['queued', 'running', 'approved', 'unknown']) {
    assert.equal(sqliteQueue.finishTask(id, 'finish-status-token', {
      ...claimed, status, updatedAt: new Date(now).toISOString(),
    }, options), false, `claim must not finish as ${status}`);
    assert.equal((await readTask(id, options)).status, 'running');
  }
  assert.equal(sqliteQueue.finishTask(id, 'finish-status-token', {
    ...claimed, id: 'another-task', status: 'completed', updatedAt: new Date(now).toISOString(),
  }, options), false, 'receipt must belong to the claimed task');
  assert.equal((await readTask(id, options)).status, 'running');

  assert.equal(sqliteQueue.finishTask(id, 'finish-status-token', {
    ...claimed, status: 'completed', updatedAt: new Date(now).toISOString(),
  }, options), true, 'valid claimed completion must still succeed');
  assert.equal((await readTask(id, options)).status, 'completed');
});

test('SQLite terminal receipts cannot rewrite the claimed task or approval provenance', async (t) => {
  const now = Date.now();
  const options = await queueOptions(t, { now });
  const id = 'finish-intent-bound';
  await enqueueTask('Read-only public lead review', {
    ...options, id, backend: 'health', riskClass: 'read_only', now,
  });
  const token = 'intent-bound-token';
  const claimed = sqliteQueue.claimTask(id, token, 'original-worker', now + 60_000, now, options);
  assert.ok(claimed);

  for (const tamper of [
    { task: 'Send an unapproved message' },
    { backend: 'codex' },
    { approvalStatus: 'approved' },
    { riskClass: 'external_write' },
    { unsafe: true },
    { requiredCapabilities: 'codex' },
    { createdAt: '2000-01-01T00:00:00.000Z' },
    { workerDeviceId: 'different-worker' },
    { startedAt: '2000-01-01T00:00:00.000Z' },
  ]) {
    const field = Object.keys(tamper)[0];
    assert.equal(sqliteQueue.finishTask(id, token, {
      ...claimed, ...tamper, status: 'completed', updatedAt: new Date(now).toISOString(),
    }, options), false, `terminal receipt must preserve ${field}`);
    const saved = await readTask(id, options);
    assert.equal(saved.status, 'running');
    assert.equal(saved.task, 'Read-only public lead review');
    assert.equal(saved.workerDeviceId, 'original-worker');
  }

  assert.equal(sqliteQueue.finishTask(id, token, {
    ...claimed, status: 'completed', updatedAt: new Date(now).toISOString(),
    resultSummary: 'bounded health check finished',
  }, options), true, 'unchanged execution intent may still finish');
  assert.equal((await readTask(id, options)).status, 'completed');
});

test('SQLite lease renewal rejects nonfinite expiry and clock values without poisoning claims', async (t) => {
  const now = Date.now();
  const options = await queueOptions(t);
  for (const id of ['nonfinite-direct', 'nonfinite-persistent']) {
    await enqueueTask('bounded health check', { ...options, id, backend: 'health', now });
    assert.ok(sqliteQueue.claimTask(id, `token-${id}`, 'worker', now + 1000, now, options));
  }
  for (const invalid of [NaN, Infinity, -Infinity]) {
    assert.equal(sqliteQueue.renewClaim('nonfinite-direct', 'token-nonfinite-direct', invalid,
      { ...options, now: now + 50 }), false);
    assert.equal((await readTask('nonfinite-direct', options)).claimExpiresAt, now + 1000);
  }
  assert.equal(sqliteQueue.renewClaim('nonfinite-direct', 'token-nonfinite-direct', now + 2000,
    { ...options, now: Infinity }), false);

  const renewer = sqliteQueue.createClaimRenewer('nonfinite-persistent', 'token-nonfinite-persistent',
    { ...options, now: now + 50 });
  try {
    for (const invalid of [NaN, Infinity, -Infinity]) {
      assert.equal(renewer.renew(invalid), false);
      assert.equal((await readTask('nonfinite-persistent', options)).claimExpiresAt, now + 1000);
    }
    assert.equal(renewer.renew(now + 2000), true, 'valid finite renewal remains possible');
  } finally {
    renewer.close();
  }
  assert.equal((await readTask('nonfinite-direct', options)).claimExpiresAt, now + 1000);
  assert.equal((await readTask('nonfinite-persistent', options)).claimExpiresAt, now + 2000);
});

test('expired SQLite claims cannot be resurrected by either renewal API', async (t) => {
  const now = Date.now();
  const options = await queueOptions(t);
  for (const id of ['expired-direct', 'expired-persistent', 'active-direct', 'active-persistent']) {
    await enqueueTask('read-only work', { ...options, id, backend: 'health', now });
    assert.ok(sqliteQueue.claimTask(id, `token-${id}`, 'worker', now + 100, now, options));
  }

  // Simulate a worker waking after the original lease expired. Even a valid
  // token cannot extend that lease and later fabricate a completion receipt.
  assert.equal(sqliteQueue.renewClaim(
    'expired-direct', 'token-expired-direct', now + 1000, { ...options, now: now + 200 },
  ), false);
  const expired = sqliteQueue.createClaimRenewer(
    'expired-persistent', 'token-expired-persistent', { ...options, now: now + 200 },
  );
  try {
    assert.equal(expired.renew(now + 1000), false);
  } finally {
    expired.close();
  }
  for (const id of ['expired-direct', 'expired-persistent']) {
    const record = await readTask(id, options);
    assert.equal(record.status, 'running');
    assert.equal(record.claimExpiresAt, now + 100);
    assert.equal(sqliteQueue.finishTask(id, `token-${id}`, {
      ...record, status: 'completed', updatedAt: new Date(now + 200).toISOString(),
    }, { ...options, now: now + 200 }), false);
  }

  // Normal heartbeats remain valid before expiry and must extend into the future.
  assert.equal(sqliteQueue.renewClaim(
    'active-direct', 'token-active-direct', now + 1000, { ...options, now: now + 50 },
  ), true);
  const active = sqliteQueue.createClaimRenewer(
    'active-persistent', 'token-active-persistent', { ...options, now: now + 50 },
  );
  try {
    assert.equal(active.renew(now + 1000), true);
    assert.equal(active.renew(now + 25), false, 'cannot shorten lease into the past');
  } finally {
    active.close();
  }
  for (const id of ['active-direct', 'active-persistent']) {
    assert.equal((await readTask(id, options)).claimExpiresAt, now + 1000);
  }
});

test('expired SQLite claim cannot finalize ordinary non-goal work', async (t) => {
  const now = Date.now();
  const options = await queueOptions(t, { now: now + 100 });
  for (const status of ['completed', 'failed', 'skipped']) {
    const id = `expired-finish-${status}`;
    await enqueueTask('bounded health task', { ...options, now, id, backend: 'health' });
    const claimed = sqliteQueue.claimTask(id, `claim-${status}`, 'original-worker', now + 10, now, options);
    assert.ok(claimed);
    assert.equal(sqliteQueue.finishTask(id, `claim-${status}`, {
      ...claimed, status, updatedAt: new Date(now + 100).toISOString(),
    }, options), false, `expired claim must not record ${status}`);
    const preserved = await readTask(id, options);
    assert.equal(preserved.status, 'running');
    assert.equal(preserved.claimExpiresAt, now + 10);
  }
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

test('SQLite worker imports public GUN intent for review but never executes it', async (t) => {
  const rootNode = fakeRoot();
  const gunOptions = { rootNode, ownerAlias: 'tenant/sqlite:exact', force: true };
  await enqueueTask('unverified legacy task', {
    ...gunOptions,
    id: 'legacy/GUN:id',
    backend: 'openai',
    requiredCapabilities: 'openai',
  });
  let legacyExecutions = 0;
  const options = await queueOptions(t, {
    ...gunOptions,
    queueStore: 'sqlite',
    workerCapabilities: 'node,openai',
    deviceId: 'hybrid-worker',
    limit: 1,
    runAgentTaskImpl: async () => {
      legacyExecutions += 1;
      return { ok: true, result: { stdout: 'must not execute' } };
    },
  });

  // The imported row stays visible, but cannot consume a worker slot or
  // bypass admission through a direct low-level SQLite claim.
  assert.deepEqual(await runWorkerOnce(options), []);
  const imported = await readTask('legacy/GUN:id', options);
  assert.equal(imported.status, 'queued');
  assert.equal(imported.queueSource, 'gun');
  assert.equal(legacyExecutions, 0);
  const now = Date.now();
  assert.equal(sqliteQueue.claimTask(imported.id, 'forged-claim', 'worker', now + 60_000, now, options), null);
  assert.equal((await readTask(imported.id, gunOptions)).status, 'queued');

  // A native, bounded health task must still run even with an older
  // imported task present and a batch limit of one.
  await enqueueTask('native health', { ...options, id: 'native-health', backend: 'health' });
  const results = await runWorkerOnce(options);
  assert.equal(results.length, 1);
  assert.equal(results[0].id, 'native-health');
  assert.equal(results[0].result.ok, true);
  assert.equal((await readTask('native-health', options)).status, 'completed');
  assert.equal((await readTask(imported.id, options)).status, 'queued');
  assert.equal(legacyExecutions, 0);
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
  // A terminal update from the original GUN source is historical import,
  // not permission for the generic SQLite edit path to mark work finished.
  assert.equal(sqliteQueue.importTask({
    ...imported, status: 'failed', updatedAt: '2026-01-02T00:00:00.000Z',
  }, options), true);
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
  // SQLite execution record must stay held until a reviewed new task ID
  // is explicitly authorized. A newer mirror timestamp is not authorization.
  assert.equal(local.status, 'review_required');
  assert.equal(local.legacyMirrorStatus, 'failed');
  assert.equal(local.task, 'legacy v1');
  assert.equal(remote.status, 'queued');
  assert.equal(remote.updatedAt, '2026-01-03T00:00:00.000Z');
});

test('worker quarantines a newer GUN completion instead of replaying imported work', async (t) => {
  const rootNode = fakeRoot();
  const gunOptions = { rootNode, ownerAlias: 'tenant/sqlite:exact', force: true };
  const options = await queueOptions(t, {
    ...gunOptions, queueStore: 'sqlite', workerCapabilities: 'node',
  });
  const now = Date.now();
  await enqueueTask('legacy external work may have happened', {
    ...gunOptions, id: 'legacy-unverified-done', backend: 'openai', now,
  });
  assert.equal((await runWorkerOnce(options)).length, 0);
  assert.equal((await readTask('legacy-unverified-done', options)).status, 'queued');
  await updateTask('legacy-unverified-done', {
    status: 'completed', resultSummary: 'relay claims success',
    updatedAt: new Date(now + 1000).toISOString(),
  }, gunOptions);
  let executions = 0;
  const results = await runWorkerOnce({
    ...options, workerCapabilities: 'openai',
    runAgentTaskImpl: async () => {
      executions += 1;
      return { ok: true, result: { stdout: 'should not run' } };
    },
  });
  assert.equal(results.length, 0);
  assert.equal(executions, 0, 'unverified relay status cannot authorize duplicate execution');
  const held = await readTask('legacy-unverified-done', options);
  assert.equal(held.status, 'review_required');
  assert.equal(held.legacyMirrorStatus, 'completed');
  assert.equal(held.resultSummary, '');
  assert.match(held.reviewReason, /Unverified legacy GUN terminal/);
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
  const finished = await readTask(id, options);
  assert.equal(finished.status, 'completed');
  assert.ok(Number.isFinite(Date.parse(finished.startedAt)), 'claimed start timestamp is preserved');
  assert.ok(Number.isFinite(Date.parse(finished.completedAt)), 'terminal completion timestamp is preserved');
  assert.equal(await readTask(id,gunOptions),null);
  assert.equal(lifeEvents,0);
  await enqueueTask('forged public replacement', {...gunOptions,id,backend:'codex',now:Date.now()+60000});
  await runWorkerOnce(options);
  const saved=await readTask(id,options);
  assert.equal(saved.status,'completed');
  assert.equal(saved.task,'private prompt');
});


test('SQLite immutable intent compares deserialized capability arrays by value', async (t) => {
  const options = await queueOptions(t);
  const now = Date.now();
  const original = {
    id: 'capability-array-terminal', task: 'Read public metadata',
    status: 'queued', backend: 'health',
    requiredCapabilities: ['node', 'codex'],
    updatedAt: new Date(now).toISOString(),
  };
  sqliteQueue.insertTask(original, options);
  const token = 'capability-array-token';
  const claimed = sqliteQueue.claimTask(original.id, token, 'worker-a', now + 60_000, now, options);
  assert.ok(claimed);

  // A changed list is still an intent rewrite and must not be accepted.
  assert.equal(sqliteQueue.finishTask(original.id, token, {
    ...claimed, requiredCapabilities: ['node', 'shell'], status: 'completed',
  }, options), false);
  assert.equal((await readTask(original.id, options)).status, 'running');

  // SQLite JSON deserialization creates a new array, even for identical intent.
  assert.equal(sqliteQueue.finishTask(original.id, token, {
    ...claimed, requiredCapabilities: ['node', 'codex'], status: 'completed',
  }, options), true);
  assert.equal((await readTask(original.id, options)).status, 'completed');
});

test('matching GUN terminal mirrors with capability arrays are quarantined', async (t) => {
  const options = await queueOptions(t);
  const now = Date.now();
  const original = {
    id: 'gun-capability-array', task: 'Read public metadata',
    status: 'queued', backend: 'health',
    requiredCapabilities: ['node', 'codex'],
    updatedAt: new Date(now).toISOString(),
  };
  assert.equal(sqliteQueue.importTask(original, options), true);
  assert.equal(sqliteQueue.importTask({
    ...original, status: 'completed',
    requiredCapabilities: ['node', 'shell'],
    updatedAt: new Date(now + 1000).toISOString(),
  }, options), false, 'changed capabilities cannot claim legacy completion');
  assert.equal((await readTask(original.id, options)).status, 'queued');

  assert.equal(sqliteQueue.importTask({
    ...original, status: 'completed',
    requiredCapabilities: ['node', 'codex'],
    updatedAt: new Date(now + 2000).toISOString(),
  }, options), true, 'matching legacy terminal intent must be held for review');
  const held = await readTask(original.id, options);
  assert.equal(held.status, 'review_required');
  assert.equal(held.legacyMirrorStatus, 'completed');
});

test('newer GUN queued mirrors cannot rewrite previously imported task intent', async (t) => {
  const options = await queueOptions(t);
  const now = Date.now();
  const original = {
    id: 'gun-queued-immutable',
    task: 'Review public prospect',
    backend: 'health',
    riskClass: 'read_only',
    approvalStatus: 'not_required',
    requiredCapabilities: ['node'],
    status: 'queued',
    createdAt: new Date(now - 1000).toISOString(),
    updatedAt: new Date(now).toISOString(),
  };
  assert.equal(sqliteQueue.importTask(original, options), true);
  for (const [field, value] of [
    ['task', 'Send unapproved external outreach'],
    ['backend', 'shell'],
    ['riskClass', 'external_write'],
    ['approvalStatus', 'approved'],
    ['requiredCapabilities', ['shell']],
  ]) {
    assert.equal(sqliteQueue.importTask({
      ...original,
      [field]: value,
      updatedAt: new Date(now + 1000).toISOString(),
    }, options), false, field);
    const stored = await readTask(original.id, options);
    assert.equal(stored.status, 'queued', field);
    assert.equal(stored.task, original.task, field);
    assert.equal(stored.backend, original.backend, field);
    assert.equal(stored.riskClass, original.riskClass, field);
    assert.equal(stored.approvalStatus, original.approvalStatus, field);
    assert.deepEqual(stored.requiredCapabilities, original.requiredCapabilities, field);
  }
  assert.equal(sqliteQueue.importTask({
    ...original, updatedAt: new Date(now + 2000).toISOString(),
  }, options), false, 'even identical mirror refreshes cannot reset provenance');
  assert.equal((await readTask(original.id, options)).updatedAt, original.updatedAt);
});

test('worker isolates a thrown claim error and still completes independent health work', async (t) => {
  const options = await queueOptions(t, {
    rootNode: fakeRoot(),
    workerCapabilities: 'node',
    gunSync: false,
  });
  const now = Date.now();
  await enqueueTask('first health', {
    ...options, id: 'claim-throws-first', backend: 'health', now: now + 1000,
  });
  await enqueueTask('second health', {
    ...options, id: 'independent-health-second', backend: 'health', now,
  });

  const originalClaim = sqliteQueue.claimTask;
  sqliteQueue.claimTask = function (id, ...args) {
    if (id === 'claim-throws-first') throw new Error('simulated SQLite claim exception');
    return originalClaim.call(this, id, ...args);
  };
  let results;
  try {
    results = await runWorkerOnce({ ...options, limit: 2 });
  } finally {
    sqliteQueue.claimTask = originalClaim;
  }

  assert.equal(results.length, 2);
  assert.equal(results[0].id, 'claim-throws-first');
  assert.equal(results[0].result.ok, false);
  assert.equal(results[0].result.requiresReview, true);
  assert.match(results[0].result.reason, /outcome unverified/);
  assert.equal(results[1].id, 'independent-health-second');
  assert.equal(results[1].result.ok, true);
  assert.equal((await readTask('claim-throws-first', options)).status, 'queued',
    'a thrown claim must not manufacture a terminal receipt');
  assert.equal((await readTask('independent-health-second', options)).status, 'completed',
    'an unrelated safe task must not be starved by the first exception');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import '../src/auth/sea.js';
import handler from '../src/operator-runtime/hosted-operator-api.js';
import { HostedTaskStore } from '../src/operator-runtime/hosted-task-store.js';
import { runHostedTaskOnce } from '../src/operator-runtime/hosted-task-worker.js';

const { default: SEA } = await import('gun/sea.js');
const origin = 'https://portal.example.test';
async function fixture(run) {
  const dir = await mkdtemp(join(tmpdir(), 'hosted-real-sea-'));
  const settings = {
    HOSTED_OPERATOR_PILOT_ENABLED: 'true',
    HOSTED_OPERATOR_PILOT_ACCOUNTING_READY: 'true',
    HOSTED_OPERATOR_PILOT_RESERVATION_CENTS: '1',
    HOSTED_OPERATOR_PILOT_ORIGIN: origin,
    HOSTED_OPERATOR_PILOT_STORE: join(dir, 'tasks.json')
  };
  const prior = Object.fromEntries(Object.keys(settings).map(key => [key, process.env[key]]));
  Object.assign(process.env, settings);
  try {
    const alice = await SEA.pair();
    const bob = await SEA.pair();
    const store = new HostedTaskStore(settings.HOSTED_OPERATOR_PILOT_STORE);
    await store.setBudget('sea:' + alice.pub, 1);
    async function request(pair, action, fields, proofOverrides = {}, bodyOverrides = {}) {
      const proof = { scope: 'hosted-operator-task', action, pub: pair.pub,
        alias: 'integration-test', origin, iat: Date.now(), ...fields, ...proofOverrides };
      const authProof = await SEA.sign(proof, pair);
      assert.ok(authProof, 'real signature was produced');
      const res = { setHeader() {}, end(value) { this.body = JSON.parse(value); } };
      await handler({ method: 'POST', body: {
        action, ...fields, authPub: pair.pub, authProof, ...bodyOverrides
      } }, res);
      return res;
    }
    await run({ alice, bob, store, request });
  } finally {
    for (const [key, value] of Object.entries(prior)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(dir, { recursive: true, force: true });
  }
}
const fields = { kind: 'repo-status', repository: 'tmsteph/3dvr-portal', idempotencyKey: 'real-proof-key-123' };

test('real signed API submission, private result recovery and cancellation', async () => {
  await fixture(async ({ alice, bob, store, request }) => {
    const created = await request(alice, 'submit', fields);
    assert.equal(created.statusCode, 202);
    const taskId = created.body.id;
    assert.equal((await request(alice, 'submit', fields)).body.id, taskId);
    assert.equal((await request(bob, 'status', { taskId })).statusCode, 404);
    assert.equal((await request(bob, 'cancel', { taskId })).statusCode, 404);
    const worker = await runHostedTaskOnce(store, taskId, {
      fetchImpl: async () => ({ ok: true, json: async () => ({
        full_name: fields.repository, default_branch: 'main', open_issues_count: 7
      }) })
    });
    assert.equal(worker.completed, true);
    // Each API request opens a fresh store; no client state or prior handler instance is reused.
    const restored = await request(alice, 'status', { taskId });
    assert.equal(restored.body.status, 'completed');
    assert.equal(JSON.parse(restored.body.result).openIssues, 7);
    assert.equal(restored.body.usage.costBasis, 'reserved_upper_bound');
    await store.setBudget('sea:' + alice.pub, 2);
    const queued = await request(alice, 'submit', { ...fields, idempotencyKey: 'real-cancel-key-123' });
    assert.equal((await request(alice, 'cancel', { taskId: queued.body.id })).body.status, 'cancelled');
    assert.equal((await request(alice, 'status', { taskId: queued.body.id })).body.status, 'cancelled');
    assert.equal((await store.budget('sea:' + alice.pub)).reservedCents, 0);
  });
});

test('real signed API rejects wrong identity, origin, scope, expiry and changed fields', async () => {
  await fixture(async ({ alice, bob, store, request }) => {
    const cases = [
      [{}, { authPub: bob.pub }],
      [{ origin: 'https://other.example.test' }, {}],
      [{ scope: 'other-task' }, {}],
      [{ iat: Date.now() - 600000 }, {}],
      [{ iat: Date.now() + 120000 }, {}],
      [{ action: 'status' }, {}],
      [{}, { repository: 'other/repository' }]
    ];
    for (const [proofOverrides, bodyOverrides] of cases) {
      const res = await request(alice, 'submit', fields, proofOverrides, bodyOverrides);
      assert.equal(res.statusCode, 401);
    }
    assert.equal((await store.read()).length, 0);
    assert.equal((await store.budget('sea:' + alice.pub)).reservedCents, 0);
  });
});

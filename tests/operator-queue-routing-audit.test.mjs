import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectRouting } from '../scripts/ops/operator-queue-routing-audit.mjs';

const noDb = () => false;

test('default environment does not match managed browser producer', () => {
  const result = inspectRouting({}, noDb);
  assert.equal(result.queueStore, 'gun');
  assert.equal(result.browserWorkerOwnerMatch, false);
  assert.equal(result.browserWorkerStoreMatch, false);
  assert.ok(result.warnings.some(warning => warning.includes('worker uses GUN')));
  assert.equal(result.gunSqliteOwnerMatch, true);
  assert.equal(result.explicitOwnerConfigured, false);
});

test('portal account fallback can diverge from SQLite owner', () => {
  const result = inspectRouting({ THREEDVR_PORTAL_ACCOUNT: 'private-portal-owner', THREEDVR_AGENT_QUEUE_STORE: 'sqlite' }, noDb);
  assert.equal(result.gunSqliteOwnerMatch, false);
  assert.equal(result.browserWorkerOwnerMatch, false);
});

test('explicit managed owner aligns browser, GUN and SQLite', () => {
  for (const store of ['gun', 'sqlite']) {
    const result = inspectRouting({ THREEDVR_AGENT_OWNER_ALIAS: '3dvr-managed', THREEDVR_AGENT_QUEUE_STORE: store }, noDb);
    assert.equal(result.gunSqliteOwnerMatch, true);
    assert.equal(result.browserWorkerOwnerMatch, true);
    assert.equal(result.browserWorkerStoreMatch, store === 'sqlite');
    if (store === 'sqlite') assert.deepEqual(result.warnings, []);
    else assert.ok(result.warnings.some(warning => warning.includes('matching owner aliases do not establish queue connectivity')));
  }
});

test('GUN worker cannot be reported compatible with signed SQLite dispatch even when owner matches', () => {
  const result = inspectRouting({
    THREEDVR_AGENT_OWNER_ALIAS: '3dvr-managed',
    THREEDVR_AGENT_QUEUE_STORE: 'gun',
    THREEDVR_AGENT_WORKER_CAPABILITIES: 'codex,node',
    THREEDVR_OPERATOR_AUDIT_REQUIRED_CAPABILITIES: 'codex',
  }, noDb);
  assert.equal(result.browserWorkerOwnerMatch, true);
  assert.equal(result.missingRequiredCapabilities.length, 0);
  assert.equal(result.browserWorkerStoreMatch, false);
  assert.ok(result.warnings.some(warning => warning.includes('worker uses GUN')));
});

test('reports database existence without opening or exposing configured path', () => {
  let observedPath = '';
  const env = { THREEDVR_AGENT_QUEUE_DB: '/private/queue.sqlite', THREEDVR_AGENT_OWNER_ALIAS: 'secret-alias' };
  const result = inspectRouting(env, path => { observedPath = path; return true; });
  assert.equal(observedPath, env.THREEDVR_AGENT_QUEUE_DB);
  assert.equal(result.queueDbFileExists, true);
  assert.equal(result.queueDbPathConfigured, true);
  assert.equal(JSON.stringify(result).includes(env.THREEDVR_AGENT_QUEUE_DB), false);
  assert.equal(JSON.stringify(result).includes(env.THREEDVR_AGENT_OWNER_ALIAS), false);
});

test('disabled GUN synchronization is flagged without touching tasks', () => {
  const result = inspectRouting({ THREEDVR_AGENT_QUEUE_GUN_SYNC: 'false' }, noDb);
  assert.equal(result.gunSyncExplicitlyDisabled, true);
});

test('read-only audit identifies stale capability mismatch without changing configuration', () => {
  const env = {
    THREEDVR_AGENT_OWNER_ALIAS: '3dvr-managed',
    THREEDVR_AGENT_QUEUE_STORE: 'sqlite',
    THREEDVR_AGENT_WORKER_CAPABILITIES: 'codex,node,static-hosting',
    THREEDVR_OPERATOR_AUDIT_REQUIRED_CAPABILITIES: 'auto,shell,auto',
  };
  const snapshot = structuredClone(env);
  const result = inspectRouting(env, noDb);
  assert.equal(result.browserWorkerOwnerMatch, true);
  assert.equal(result.workerCapabilitiesConfigured, true);
  assert.equal(result.requiredCapabilitiesAudited, 3);
  assert.deepEqual(result.missingRequiredCapabilities, ['auto', 'shell']);
  assert.ok(result.warnings.some(warning => warning.includes('Do not enable stale tasks')));
  assert.deepEqual(env, snapshot);
});

test('configured matching capabilities and SQLite store do not trigger mismatch warning', () => {
  const result = inspectRouting({
    THREEDVR_AGENT_OWNER_ALIAS: '3dvr-managed',
    THREEDVR_AGENT_QUEUE_STORE: 'sqlite',
    THREEDVR_AGENT_WORKER_CAPABILITIES: 'auto,shell,node',
    THREEDVR_OPERATOR_AUDIT_REQUIRED_CAPABILITIES: 'auto,shell',
  }, noDb);
  assert.deepEqual(result.missingRequiredCapabilities, []);
  assert.deepEqual(result.warnings, []);
});

test('unset worker capabilities cannot silently pass required-capability audit', () => {
  const result = inspectRouting({
    THREEDVR_AGENT_OWNER_ALIAS: '3dvr-managed',
    THREEDVR_AGENT_QUEUE_STORE: 'sqlite',
    THREEDVR_OPERATOR_AUDIT_REQUIRED_CAPABILITIES: 'codex,shell',
  }, noDb);
  assert.equal(result.workerCapabilitiesConfigured, false);
  assert.deepEqual(result.missingRequiredCapabilities, ['codex', 'shell']);
  assert.ok(result.warnings.some(warning => warning.includes('unverified')));
  assert.ok(result.warnings.some(warning => warning.includes('Do not enable stale tasks')));
});

test('unknown required capability labels are never echoed from queue metadata', () => {
  const secret = 'private-client-secret-XYZ';
  const result = inspectRouting({
    THREEDVR_AGENT_OWNER_ALIAS: '3dvr-managed',
    THREEDVR_AGENT_QUEUE_STORE: 'sqlite',
    THREEDVR_AGENT_WORKER_CAPABILITIES: 'codex,' + secret,
    THREEDVR_OPERATOR_AUDIT_REQUIRED_CAPABILITIES: secret + ',codex,unknown-other',
  }, noDb);
  assert.deepEqual(result.missingRequiredCapabilities, []);
  assert.equal(result.unknownRequiredCapabilitiesCount, 2);
  assert.ok(result.warnings.some(warning => warning.includes('Unknown required capability')));
  assert.equal(JSON.stringify(result).includes(secret), false);
  assert.equal(JSON.stringify(result).includes('unknown-other'), false);
});

test('whitespace-only capabilities are not evidence of worker configuration', () => {
  const result = inspectRouting({
    THREEDVR_AGENT_OWNER_ALIAS: '3dvr-managed',
    THREEDVR_AGENT_QUEUE_STORE: 'sqlite',
    THREEDVR_AGENT_WORKER_CAPABILITIES: '   ',
    THREEDVR_OPERATOR_AUDIT_REQUIRED_CAPABILITIES: 'codex',
  }, noDb);
  assert.equal(result.workerCapabilitiesConfigured, false);
  assert.deepEqual(result.missingRequiredCapabilities, ['codex']);
  assert.ok(result.warnings.some(warning => warning.includes('not explicitly configured')));
});

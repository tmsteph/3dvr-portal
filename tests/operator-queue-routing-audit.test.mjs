import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectRouting } from '../scripts/ops/operator-queue-routing-audit.mjs';

const noDb = () => false;

test('default environment does not match managed browser producer', () => {
  const result = inspectRouting({}, noDb);
  assert.equal(result.queueStore, 'gun');
  assert.equal(result.browserWorkerOwnerMatch, false);
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
    assert.deepEqual(result.warnings, []);
  }
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

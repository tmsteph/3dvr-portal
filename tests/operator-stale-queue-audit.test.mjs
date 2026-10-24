import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeQueue, auditManagedSqlite } from '../scripts/ops/operator-stale-queue-audit.mjs';

const now = Date.parse('2026-10-23T10:00:00Z');
const env = {
  THREEDVR_AGENT_WORKER_CAPABILITIES: 'codex,node,static-hosting',
  THREEDVR_AGENT_WORKER_RISK_CLASSES: 'read_only,draft,workspace_write'
};

test('old unsafe shell task is review-only even with historical approval', () => {
  const task = {
    id: 'private-task-id', status: 'queued', backend: 'shell',
    task: 'secret private task text', createdAt: '2026-09-01T00:00:00Z',
    riskClass: 'read_only', approvalStatus: 'approved', unsafe: true
  };
  const report = summarizeQueue([task], env, now);
  assert.equal(report.total, 1);
  assert.equal(report.queuedAgeBuckets['>30d'], 1);
  assert.equal(report.queuedCapabilities.shell, 1);
  assert.deepEqual(report.queuedReviews[0].flags, [
    'stale_or_unknown_age', 'missing_capability', 'unsafe_flag', 'requires_intent_review'
  ]);
  assert.equal(JSON.stringify(report).includes(task.task), false);
  assert.equal(JSON.stringify(report).includes(task.id), false);
});

test('exact prior completion only flags possible duplicate, never automatically deletes', () => {
  const completed = { id: 'done', status: 'completed', backend: 'auto', task: 'Check the queue' };
  const queued = { id: 'again', status: 'queued', backend: 'auto', task: ' check   the QUEUE ', createdAt: '2026-10-20T00:00:00Z' };
  const report = summarizeQueue([completed, queued], env, now);
  assert.equal(report.statusCounts.completed, 1);
  assert.equal(report.statusCounts.queued, 1);
  assert.ok(report.queuedReviews[0].flags.includes('possible_prior_completion'));
  assert.ok(report.queuedReviews[0].flags.includes('missing_capability'));
});

test('fresh intrinsic health metadata is not execution authorization', () => {
  const task = { id: 'health', status: 'queued', backend: 'health', task: 'health', createdAt: '2026-10-23T09:00:00Z', riskClass: 'read_only' };
  const report = summarizeQueue([task], env, now);
  assert.deepEqual(report.queuedReviews[0].flags, ['metadata_eligible_not_authorized']);
  assert.equal(report.queuedAgeBuckets['<=7d'], 1);
});

test('missing timestamps and sensitive approval remain review-only', () => {
  const task = { id: 'unknown', status: 'queued', backend: 'codex', task: 'private', riskClass: 'money', approvalStatus: 'required' };
  const report = summarizeQueue([task], env, now);
  assert.deepEqual(report.queuedReviews[0].flags, ['stale_or_unknown_age', 'risk_not_allowed', 'approval_block']);
});

test('missing worker capabilities never default to an apparently eligible queue', () => {
  const task = { id: 'fresh', status: 'queued', backend: 'codex', task: 'read-only local check',
    createdAt: '2026-10-23T09:00:00Z', riskClass: 'read_only' };
  const report = summarizeQueue([task], { THREEDVR_AGENT_WORKER_RISK_CLASSES: 'read_only' }, now);
  assert.equal(report.workerCapabilitiesConfigured, false);
  assert.ok(report.queuedReviews[0].flags.includes('worker_capabilities_unverified'));
  assert.ok(!report.queuedReviews[0].flags.includes('metadata_eligible_not_authorized'));
  assert.ok(!report.queuedReviews[0].flags.includes('missing_capability'));
});

test('explicit worker capability configuration retains normal eligibility classification', () => {
  const task = { id: 'fresh', status: 'queued', backend: 'codex', task: 'read-only local check',
    createdAt: '2026-10-23T09:00:00Z', riskClass: 'read_only' };
  const report = summarizeQueue([task], env, now);
  assert.equal(report.workerCapabilitiesConfigured, true);
  assert.deepEqual(report.queuedReviews[0].flags, ['metadata_eligible_not_authorized']);
});

test('SQLite audit refuses implicit owner or non-SQLite mode before opening a database', () => {
  assert.throws(() => auditManagedSqlite({ THREEDVR_AGENT_QUEUE_STORE: 'sqlite' }), /Explicit managed SQLite/);
  assert.throws(() => auditManagedSqlite({ THREEDVR_AGENT_QUEUE_STORE: 'gun', THREEDVR_AGENT_OWNER_ALIAS: '3dvr-managed' }), /Explicit managed SQLite/);
});

test('stale queue metadata never marks blocked high-risk approval states eligible', () => {
  const allowed = {
    THREEDVR_AGENT_WORKER_CAPABILITIES: 'codex',
    THREEDVR_AGENT_WORKER_RISK_CLASSES: 'read_only,external_write,money,credential'
  };
  for (const riskClass of ['external_write', 'money', 'credential']) {
    for (const approvalStatus of [undefined, 'not_required', 'expired', 'pending', 'denied', 'rejected', 'unknown']) {
      const task = {
        id: 'sensitive', status: 'queued', backend: 'codex', task: 'private task',
        createdAt: '2026-10-23T09:00:00Z', riskClass, approvalStatus
      };
      const flags = summarizeQueue([task], allowed, now).queuedReviews[0].flags;
      assert.ok(flags.includes('approval_block'), riskClass + ':' + approvalStatus);
      assert.ok(!flags.includes('metadata_eligible_not_authorized'));
    }
    const approved = {
      id: 'approved', status: 'queued', backend: 'codex', task: 'private task',
      createdAt: '2026-10-23T09:00:00Z', riskClass, approvalStatus: 'approved'
    };
    assert.deepEqual(summarizeQueue([approved], allowed, now).queuedReviews[0].flags,
      ['metadata_eligible_not_authorized']);
  }
});

test('stale queue audit distinguishes absent low-risk approval from invalid or expired approval', () => {
  const task = {
    id: 'low-risk', status: 'queued', backend: 'codex', task: 'private task',
    createdAt: '2026-10-23T09:00:00Z', riskClass: 'read_only'
  };
  assert.deepEqual(summarizeQueue([task], env, now).queuedReviews[0].flags,
    ['metadata_eligible_not_authorized']);
  for (const approvalStatus of ['expired', 'unknown', 'pending', 'denied']) {
    const flags = summarizeQueue([{ ...task, approvalStatus }], env, now).queuedReviews[0].flags;
    assert.deepEqual(flags, ['approval_block']);
  }
});

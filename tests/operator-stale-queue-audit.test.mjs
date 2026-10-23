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

test('SQLite audit refuses implicit owner or non-SQLite mode before opening a database', () => {
  assert.throws(() => auditManagedSqlite({ THREEDVR_AGENT_QUEUE_STORE: 'sqlite' }), /Explicit managed SQLite/);
  assert.throws(() => auditManagedSqlite({ THREEDVR_AGENT_QUEUE_STORE: 'gun', THREEDVR_AGENT_OWNER_ALIAS: '3dvr-managed' }), /Explicit managed SQLite/);
});

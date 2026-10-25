import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeQueue, auditManagedSqlite } from '../scripts/ops/operator-stale-queue-audit.mjs';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const now = Date.parse('2026-10-23T10:00:00Z');
const env = {
  THREEDVR_AGENT_WORKER_CAPABILITIES: 'codex,node,static-hosting',
  THREEDVR_AGENT_WORKER_RISK_CLASSES: 'read_only,draft,workspace_write'
};


test('read-only audit classifies stored running leases without leaking identifiers', (t) => {
  const dir = mkdtempSync(join(tmpdir(), '3dvr-lease-audit-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const dbPath = join(dir, 'queue.sqlite');
  const db = new DatabaseSync(dbPath);
  db.exec('CREATE TABLE tasks (owner_alias TEXT, status TEXT, record_json TEXT, claim_expires_at INTEGER)');
  const insert = db.prepare('INSERT INTO tasks VALUES (?, ?, ?, ?)');
  const current = Date.now();
  for (const [id, lease, owner] of [
    ['private-expired', current - 10000, 'test-owner'],
    ['private-active', current + 600000, 'test-owner'],
    ['private-unknown', null, 'test-owner'],
    ['private-other-owner', current - 10000, 'another-owner'],
  ]) {
    insert.run(owner, 'running', JSON.stringify({ id, status: 'running', task: 'private task text' }), lease);
  }
  db.close();
  const report = auditManagedSqlite({
    THREEDVR_AGENT_QUEUE_STORE: 'sqlite',
    THREEDVR_AGENT_OWNER_ALIAS: 'test-owner',
    THREEDVR_AGENT_QUEUE_DB: dbPath,
  });
  assert.equal(report.total, 3);
  assert.equal(report.statusCounts.running, 3);
  assert.deepEqual(report.runningClaims, { active: 1, expired: 1, unknown: 1 });
  assert.equal(JSON.stringify(report).includes('private-'), false);
  assert.equal(JSON.stringify(report).includes('private task text'), false);
});

test('lease expiry boundary and malformed leases stay out of executable queue', () => {
  const records = [
    { id: 'boundary', status: 'running', claimExpiresAt: now },
    { id: 'malformed', status: 'running', claimExpiresAt: 'invalid' },
    { id: 'missing', status: 'running' },
  ];
  const report = summarizeQueue(records, env, now);
  assert.deepEqual(report.runningClaims, { active: 0, expired: 1, unknown: 2 });
  assert.deepEqual(report.queuedReviews, []);
  assert.equal(report.statusCounts.running, 3);
});

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
    'stale_or_unknown_age', 'missing_capability', 'risk_not_allowed',
    'approval_verification_unavailable', 'unsafe_flag', 'requires_intent_review'
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
  assert.deepEqual(report.queuedReviews[0].flags, [
    'stale_or_unknown_age', 'risk_not_allowed', 'approval_block', 'approval_verification_unavailable'
  ]);
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
      assert.ok(flags.includes('approval_verification_unavailable'), riskClass + ':' + approvalStatus);
      assert.ok(!flags.includes('metadata_eligible_not_authorized'));
    }
    const approved = {
      id: 'approved', status: 'queued', backend: 'codex', task: 'private task',
      createdAt: '2026-10-23T09:00:00Z', riskClass, approvalStatus: 'approved'
    };
    assert.deepEqual(summarizeQueue([approved], allowed, now).queuedReviews[0].flags,
      ['approval_verification_unavailable']);
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


test('unsafe low-risk labels are evaluated as external_write, not metadata eligible', () => {
  const allowed = {
    THREEDVR_AGENT_WORKER_CAPABILITIES: 'shell',
    THREEDVR_AGENT_WORKER_RISK_CLASSES: 'read_only,draft,external_write'
  };
  for (const approvalStatus of ['not_required', 'approved']) {
    const task = {
      id: 'private-unsafe', status: 'queued', backend: 'shell', task: 'private text',
      createdAt: '2026-10-23T09:00:00Z', riskClass: 'read_only', unsafe: true, approvalStatus
    };
    const report = summarizeQueue([task], allowed, now);
    const review = report.queuedReviews[0];
    assert.equal(review.risk, 'read_only');
    assert.equal(review.effectiveRisk, 'external_write');
    assert.equal(report.queuedEffectiveRisks.external_write, 1);
    assert.ok(review.flags.includes('approval_verification_unavailable'));
    assert.ok(review.flags.includes('unsafe_flag'));
    assert.ok(!review.flags.includes('metadata_eligible_not_authorized'));
    assert.equal(review.flags.includes('approval_block'), approvalStatus !== 'approved');
    assert.equal(JSON.stringify(report).includes(task.task), false);
  }
});

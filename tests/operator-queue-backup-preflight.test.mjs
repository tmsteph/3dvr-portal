import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, linkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { auditOperatorQueueBackup } from '../scripts/ops/operator-queue-backup-preflight.mjs';

function makeQueue(path, rows) {
  const db = new DatabaseSync(path);
  try {
    db.exec('CREATE TABLE tasks (owner_alias TEXT, id TEXT, status TEXT, source TEXT, record_json TEXT)');
    db.exec('CREATE INDEX tasks_status_idx ON tasks(status)');
    const insert = db.prepare('INSERT INTO tasks VALUES (?, ?, ?, ?, ?)');
    for (const row of rows) insert.run('3dvr-managed', row.id, row.status, row.source, JSON.stringify(row.payload));
  } finally { db.close(); }
}

const records = [
  { id: 'legacy-1', status: 'queued', source: 'gun', payload: { task: 'private synthetic 1' } },
  { id: 'legacy-2', status: 'completed', source: 'sqlite', payload: { task: 'private synthetic 2' } }
];

test('a distinct intact matching queue snapshot passes metadata-only preflight, not restore approval', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'operator-backup-check-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const livePath = join(dir, 'live.sqlite');
  const snapshotPath = join(dir, 'snapshot.sqlite');
  makeQueue(livePath, records);
  makeQueue(snapshotPath, records);
  const result = auditOperatorQueueBackup({ livePath, snapshotPath });
  assert.equal(result.status, 'queue_snapshot_matches');
  assert.equal(result.taskCount, 2);
  assert.deepEqual(result.statusCounts, { queued: 1, completed: 1 });
  assert.equal(result.liveQuickCheck, 'ok');
  assert.equal(result.snapshotQuickCheck, 'ok');
  assert.equal(result.liveFullIntegrityCheck, 'ok');
  assert.equal(result.snapshotFullIntegrityCheck, 'ok');
  assert.equal(result.restoreTested, false);
  assert.equal(result.offHostVerified, false);
  assert.equal(result.dropletBackupVerified, false);
  assert.doesNotMatch(JSON.stringify(result), /private synthetic|legacy-1|legacy-2/);
});

test('missing, same-inode, changed, and invalid snapshots fail closed without touching the queue', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'operator-backup-reject-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const livePath = join(dir, 'live.sqlite');
  const snapshotPath = join(dir, 'snapshot.sqlite');
  const hardlinkPath = join(dir, 'hardlink.sqlite');
  makeQueue(livePath, records);
  assert.throws(() => auditOperatorQueueBackup({ livePath, snapshotPath }), /missing/);
  assert.throws(() => auditOperatorQueueBackup({ livePath, snapshotPath: livePath }), /separate/);
  linkSync(livePath, hardlinkPath);
  assert.throws(() => auditOperatorQueueBackup({ livePath, snapshotPath: hardlinkPath }), /separate/);
  makeQueue(snapshotPath, [{ ...records[0], payload: { task: 'different' } }, records[1]]);
  assert.throws(() => auditOperatorQueueBackup({ livePath, snapshotPath }), /does not match/);
  const db = new DatabaseSync(snapshotPath);
  db.exec('DROP TABLE tasks');
  db.close();
  assert.throws(() => auditOperatorQueueBackup({ livePath, snapshotPath }), /tasks table is missing/);
  writeFileSync(snapshotPath, 'not a database');
  assert.throws(() => auditOperatorQueueBackup({ livePath, snapshotPath }));
  const verify = new DatabaseSync(livePath, { readOnly: true });
  assert.equal(verify.prepare('SELECT COUNT(*) AS n FROM tasks').get().n, 2);
  verify.close();
});


test('snapshot with identical tasks but missing an index fails closed', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'operator-backup-schema-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const livePath = join(dir, 'live.sqlite');
  const snapshotPath = join(dir, 'snapshot.sqlite');
  makeQueue(livePath, records);
  makeQueue(snapshotPath, records);
  const snapshot = new DatabaseSync(snapshotPath);
  snapshot.exec('DROP INDEX tasks_status_idx');
  snapshot.close();
  assert.throws(() => auditOperatorQueueBackup({ livePath, snapshotPath }), /does not match/);
  const live = new DatabaseSync(livePath, { readOnly: true });
  assert.equal(live.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='index' AND name='tasks_status_idx'").get().n, 1);
  live.close();
});

test('unverified application tables block snapshot approval even when task rows match', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'operator-backup-extra-table-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const livePath = join(dir, 'live.sqlite');
  const snapshotPath = join(dir, 'snapshot.sqlite');
  for (const path of [livePath, snapshotPath]) {
    makeQueue(path, records);
    const db = new DatabaseSync(path);
    db.exec('CREATE TABLE task_receipts (id TEXT PRIMARY KEY, receipt TEXT NOT NULL)');
    db.prepare('INSERT INTO task_receipts VALUES (?, ?)').run('task-1', path === livePath ? 'actual-private-receipt' : 'missing-private-receipt');
    db.close();
  }
  assert.throws(
    () => auditOperatorQueueBackup({ livePath, snapshotPath }),
    /application tables not covered/
  );
  const live = new DatabaseSync(livePath, { readOnly: true });
  try {
    assert.equal(live.prepare('SELECT receipt FROM task_receipts').get().receipt, 'actual-private-receipt');
  } finally { live.close(); }
});

// quick_check accepts a malformed UNIQUE index with duplicate entries; a
// matching schema/task digest alone would incorrectly accept both files.
test('matching corrupt UNIQUE indexes fail closed even when quick_check passes', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'operator-backup-unique-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const livePath = join(dir, 'live.sqlite');
  const snapshotPath = join(dir, 'snapshot.sqlite');
  const duplicatedStatuses = [records[0], { ...records[1], status: 'queued' }];
  for (const path of [livePath, snapshotPath]) {
    makeQueue(path, duplicatedStatuses);
    // Synthetic corruption only: rewrite the index declaration without
    // rebuilding its b-tree. Neither file is a production queue.
    const db = new DatabaseSync(path);
    db.exec('PRAGMA writable_schema = ON');
    db.exec("UPDATE sqlite_master SET sql = 'CREATE UNIQUE INDEX tasks_status_idx ON tasks(status)' WHERE name = 'tasks_status_idx'");
    db.close();
  }
  const probe = new DatabaseSync(livePath, { readOnly: true });
  assert.equal(probe.prepare('PRAGMA quick_check').get().quick_check, 'ok');
  assert.match(probe.prepare('PRAGMA integrity_check').get().integrity_check, /non-unique entry/);
  probe.close();
  assert.throws(() => auditOperatorQueueBackup({ livePath, snapshotPath }), /full integrity check failed/);
});

test('heartbeat snapshot parity: matching tasks but different worker liveness fails closed', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'operator-backup-heartbeats-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const livePath = join(dir, 'live.sqlite');
  const snapshotPath = join(dir, 'snapshot.sqlite');
  for (const path of [livePath, snapshotPath]) {
    makeQueue(path, records);
    const db = new DatabaseSync(path);
    db.exec(`CREATE TABLE worker_heartbeats (
      owner_alias TEXT NOT NULL, worker_id TEXT NOT NULL,
      observed_at INTEGER NOT NULL, PRIMARY KEY (owner_alias, worker_id)
    ) WITHOUT ROWID`);
    db.prepare('INSERT INTO worker_heartbeats VALUES (?, ?, ?)').run('3dvr-managed', 'worker-canary', 12345);
    db.close();
  }
  assert.equal(auditOperatorQueueBackup({ livePath, snapshotPath }).status, 'queue_snapshot_matches');
  const snapshot = new DatabaseSync(snapshotPath);
  snapshot.prepare('UPDATE worker_heartbeats SET observed_at = ? WHERE worker_id = ?').run(12346, 'worker-canary');
  snapshot.close();
  assert.throws(() => auditOperatorQueueBackup({ livePath, snapshotPath }), /does not match/);
  const live = new DatabaseSync(livePath, { readOnly: true });
  assert.equal(live.prepare('SELECT observed_at FROM worker_heartbeats').get().observed_at, 12345);
  live.close();
});


test('malformed queue status metadata is counted without leaking private values or prototype keys', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'operator-backup-status-redaction-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const livePath = join(dir, 'live.sqlite');
  const snapshotPath = join(dir, 'snapshot.sqlite');
  const rows = [
    records[0],
    { ...records[1], status: '__proto__' },
    { id: 'legacy-3', status: 'private-customer-secret-status', source: 'gun', payload: { task: 'private synthetic 3' } }
  ];
  makeQueue(livePath, rows);
  makeQueue(snapshotPath, rows);
  const report = auditOperatorQueueBackup({ livePath, snapshotPath });
  assert.equal(report.status, 'queue_snapshot_matches');
  assert.equal(report.taskCount, 3);
  assert.deepEqual(report.statusCounts, { queued: 1, other: 2 });
  assert.doesNotMatch(JSON.stringify(report), /private-customer-secret-status|__proto__|private synthetic/);
  const db = new DatabaseSync(livePath, { readOnly: true });
  try { assert.equal(db.prepare('SELECT COUNT(*) AS count FROM tasks').get().count, 3); }
  finally { db.close(); }
});

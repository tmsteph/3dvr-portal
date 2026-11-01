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

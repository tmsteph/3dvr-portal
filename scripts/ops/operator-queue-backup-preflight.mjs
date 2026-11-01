#!/usr/bin/env node
// Read-only queue snapshot preflight. Never creates backups, runs migrations,
// reads customer records into logs, or claims a droplet-level recovery point.
import { createHash } from 'node:crypto';
import { existsSync, realpathSync, statSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';

function fingerprint(path) {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const checks = db.prepare('PRAGMA quick_check').all();
    if (checks.length !== 1 || checks[0].quick_check !== 'ok') {
      throw new Error('SQLite integrity check failed');
    }
    if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='tasks'").get()) {
      throw new Error('Expected queue tasks table is missing');
    }
    // Digest every task column and the schema, including private payloads,
    // without returning task IDs, prompts, customer data, or secrets.
    const digest = createHash('sha256');
    // A task-row match alone can miss a dropped index or trigger. Compare
    // all application schema objects as well as task rows before migration.
    digest.update(JSON.stringify(db.prepare("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name").all()));
    digest.update('\n');
    digest.update(JSON.stringify(db.prepare('PRAGMA table_info(tasks)').all()));
    digest.update('\n');
    let count = 0;
    const states = {};
    for (const row of db.prepare('SELECT * FROM tasks ORDER BY owner_alias,id').iterate()) {
      digest.update(JSON.stringify(row));
      digest.update('\n');
      states[row.status] = (states[row.status] || 0) + 1;
      count++;
    }
    return { count, states, digest: digest.digest('hex') };
  } finally { db.close(); }
}

export function auditOperatorQueueBackup({ livePath, snapshotPath } = {}) {
  if (!livePath || !snapshotPath || livePath === ':memory:' || snapshotPath === ':memory:') {
    throw new Error('Two existing SQLite file paths are required');
  }
  if (!existsSync(livePath) || !existsSync(snapshotPath)) {
    throw new Error('Live queue or snapshot file is missing');
  }
  const liveReal = realpathSync(livePath);
  const snapshotReal = realpathSync(snapshotPath);
  const liveStat = statSync(liveReal);
  const snapshotStat = statSync(snapshotReal);
  if (!liveStat.isFile() || !snapshotStat.isFile() ||
      (liveStat.dev === snapshotStat.dev && liveStat.ino === snapshotStat.ino)) {
    throw new Error('Snapshot must be a separate existing SQLite file');
  }
  const live = fingerprint(liveReal);
  const snapshot = fingerprint(snapshotReal);
  if (live.digest !== snapshot.digest || live.count !== snapshot.count) {
    throw new Error('Snapshot does not match the live queue; do not migrate');
  }
  // A matching, structurally consistent SQLite file is only a QUEUE snapshot
  // preflight. It is not evidence of an off-host copy or tested restore.
  return {
    status: 'queue_snapshot_matches',
    taskCount: live.count,
    statusCounts: live.states,
    payloadFingerprint: live.digest,
    liveQuickCheck: 'ok', snapshotQuickCheck: 'ok',
    restoreTested: false, offHostVerified: false, dropletBackupVerified: false
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = auditOperatorQueueBackup({
      livePath: process.env.THREEDVR_AGENT_QUEUE_DB,
      snapshotPath: process.env.OPERATOR_QUEUE_SNAPSHOT_PATH
    });
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } catch {
    console.error('QUEUE_BACKUP_PREFLIGHT=blocked (missing, invalid or mismatched snapshot; no changes made)');
    process.exitCode = 1;
  }
}

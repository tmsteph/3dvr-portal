const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');

const DEFAULT_DB_PATH = process.env.THREEDVR_AGENT_QUEUE_DB
  || path.join(os.homedir(), '.3dvr', 'task-queue.sqlite');

function databasePath(options = {}) {
  return options.queueDb || DEFAULT_DB_PATH;
}

function ownerAlias(options = {}) {
  return String(options.ownerAlias || process.env.THREEDVR_AGENT_OWNER_ALIAS || 'anonymous@3dvr');
}

function openDatabase(options = {}) {
  const filePath = databasePath(options);
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(filePath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = FULL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS tasks (
      owner_alias TEXT NOT NULL,
      id TEXT NOT NULL,
      status TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      record_json TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'sqlite',
      claim_token TEXT,
      claim_expires_at INTEGER,
      PRIMARY KEY (owner_alias, id)
    ) WITHOUT ROWID;
    CREATE INDEX IF NOT EXISTS tasks_owner_status_updated
      ON tasks (owner_alias, status, updated_at);
  `);
  return db;
}

function withDatabase(options, callback) {
  const db = openDatabase(options);
  try {
    return callback(db);
  } finally {
    db.close();
  }
}

function parseRecord(row) {
  if (!row) return null;
  return {
    ...JSON.parse(row.record_json),
    queueSource: row.source,
    claimExpiresAt: row.claim_expires_at || null,
  };
}

function writeTask(record, options = {}) {
  return withDatabase(options, (db) => {
    db.prepare(`
      INSERT INTO tasks (owner_alias, id, status, updated_at, record_json, source)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(owner_alias, id) DO UPDATE SET
        status = excluded.status,
        updated_at = excluded.updated_at,
        record_json = excluded.record_json
    `).run(
      ownerAlias(options),
      String(record.id),
      String(record.status),
      String(record.updatedAt),
      JSON.stringify(record),
      options.queueSource || 'sqlite',
    );
    return record;
  });
}

function importTask(record, options = {}) {
  return withDatabase(options, (db) => {
    const result = db.prepare(`
      INSERT INTO tasks
        (owner_alias, id, status, updated_at, record_json, source)
      VALUES (?, ?, ?, ?, ?, 'gun')
      ON CONFLICT(owner_alias, id) DO UPDATE SET
        status = excluded.status,
        updated_at = excluded.updated_at,
        record_json = excluded.record_json,
        source = 'gun',
        claim_token = NULL,
        claim_expires_at = NULL
      WHERE (tasks.claim_token IS NULL OR tasks.claim_expires_at <= ?)
        AND excluded.updated_at > tasks.updated_at
    `).run(
      ownerAlias(options),
      String(record.id),
      String(record.status),
      String(record.updatedAt),
      JSON.stringify(record),
      options.now || Date.now(),
    );
    return result.changes === 1;
  });
}

function renewClaim(id, claimToken, expiresAt, options = {}) {
  return withDatabase(options, (db) => db.prepare(`
    UPDATE tasks SET claim_expires_at = ?
    WHERE owner_alias = ? AND id = ? AND claim_token = ? AND status = 'running'
  `).run(expiresAt, ownerAlias(options), String(id), claimToken).changes === 1);
}

function createClaimRenewer(id, claimToken, options = {}) {
  const db = openDatabase(options);
  const statement = db.prepare(`
    UPDATE tasks SET claim_expires_at = ?
    WHERE owner_alias = ? AND id = ? AND claim_token = ? AND status = 'running'
  `);
  const alias = ownerAlias(options);
  const taskId = String(id);
  return {
    renew(expiresAt) {
      return statement.run(expiresAt, alias, taskId, claimToken).changes === 1;
    },
    close() {
      db.close();
    },
  };
}

function readTask(id, options = {}) {
  return withDatabase(options, (db) => parseRecord(db.prepare(`
    SELECT record_json, source, claim_expires_at FROM tasks WHERE owner_alias = ? AND id = ?
  `).get(ownerAlias(options), String(id))));
}

function listTasks(options = {}) {
  return withDatabase(options, (db) => db.prepare(`
    SELECT record_json, source, claim_expires_at FROM tasks
    WHERE owner_alias = ?
    ORDER BY updated_at DESC, id ASC
  `).all(ownerAlias(options)).map(parseRecord));
}

// Expired running claims are held for review, never automatically replayed:
// the previous worker may have completed irreversible side effects before crashing.
function claimTask(id, claimToken, workerDeviceId, expiresAt, now, options = {}) {
  return withDatabase(options, (db) => {
    db.exec('BEGIN IMMEDIATE');
    try {
      const row = db.prepare(`
        SELECT record_json, source FROM tasks
        WHERE owner_alias = ? AND id = ?
          AND status = 'queued'
      `).get(ownerAlias(options), String(id));
      if (!row) {
        db.exec('ROLLBACK');
        return null;
      }
      const record = JSON.parse(row.record_json);
      const updated = {
        ...record,
        status: 'running',
        workerDeviceId,
        startedAt: new Date(now).toISOString(),
        updatedAt: new Date(now).toISOString(),
      };
      const result = db.prepare(`
        UPDATE tasks SET status = 'running', updated_at = ?, record_json = ?,
          claim_token = ?, claim_expires_at = ?
        WHERE owner_alias = ? AND id = ?
          AND status = 'queued'
      `).run(
        updated.updatedAt,
        JSON.stringify(updated),
        claimToken,
        expiresAt,
        ownerAlias(options),
        String(id),
      );
      db.exec('COMMIT');
      return result.changes === 1 ? { ...updated, queueSource: row.source, claimToken } : null;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  });
}

// Goal checkpoints share the task row and its worker claim. These helpers are
// opt-in; existing single-action tasks retain their lifecycle.
function mutateTaskGoal(id, claimToken, expectedRevision, update, options = {}) {
  if (!options.ownerAlias || !claimToken) throw new Error('owner and claim required');
  const now = options.now ?? Date.now();
  return withDatabase(options, (db) => {
    db.exec('BEGIN IMMEDIATE');
    try {
      const row = db.prepare(`
        SELECT record_json FROM tasks
        WHERE owner_alias = ? AND id = ? AND status = 'running'
          AND claim_token = ? AND claim_expires_at > ?
      `).get(ownerAlias(options), String(id), claimToken, now);
      if (!row) throw new Error('active task claim required');
      const record = JSON.parse(row.record_json);
      const revision = record.goal?.revision ?? null;
      if (revision !== expectedRevision) throw new Error('goal revision conflict');
      const goal = update(record.goal);
      const updated = { ...record, goal, updatedAt: new Date(now).toISOString() };
      db.prepare(`
        UPDATE tasks SET record_json = ?, updated_at = ?
        WHERE owner_alias = ? AND id = ?
      `).run(JSON.stringify(updated), updated.updatedAt, ownerAlias(options), String(id));
      db.exec('COMMIT');
      return goal;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  });
}

function initializeTaskGoal(id, claimToken, definition, options = {}) {
  const { createGoal } = require('./muse-goal-state');
  if (!definition.acceptanceChecks?.length) throw new Error('acceptance checks required');
  return mutateTaskGoal(id, claimToken, null,
    () => createGoal({ ...definition, id: String(id), now: new Date(options.now ?? Date.now()).toISOString() }), options);
}

function transitionTaskGoal(id, claimToken, expectedRevision, event, options = {}) {
  const { transition } = require('./muse-goal-state');
  return mutateTaskGoal(id, claimToken, expectedRevision,
    goal => transition(goal, event, new Date(options.now ?? Date.now()).toISOString()), options);
}

function finishTask(id, claimToken, record, options = {}) {
  return withDatabase(options, (db) => {
    db.exec('BEGIN IMMEDIATE');
    try {
      const stored = db.prepare('SELECT record_json, claim_expires_at FROM tasks WHERE owner_alias = ? AND id = ? AND claim_token = ? AND status = ?')
        .get(ownerAlias(options), String(id), claimToken, 'running');
      const goal = stored ? JSON.parse(stored.record_json).goal : null;
      if (goal) {
        if (stored.claim_expires_at <= (options.now ?? Date.now())) {
          db.exec('ROLLBACK');
          return false;
        }
        if (['completed', 'complete', 'done', 'success', 'succeeded'].includes(record.status) && goal.status !== 'complete') {
          db.exec('ROLLBACK');
          return false;
        }
        const storedRecord = JSON.parse(stored.record_json);
        const candidates = [record.updatedAt, storedRecord.updatedAt, new Date(options.now ?? Date.now()).toISOString()];
        const updatedAt = candidates.filter(value => Number.isFinite(Date.parse(value)))
          .reduce((latest, value) => Date.parse(value) > Date.parse(latest) ? value : latest);
        record = { ...record, goal, updatedAt };
      }
      const result = db.prepare(`
        UPDATE tasks SET status = ?, updated_at = ?, record_json = ?,
          claim_token = NULL, claim_expires_at = NULL
        WHERE owner_alias = ? AND id = ? AND claim_token = ? AND status = 'running'
      `).run(
        String(record.status),
        String(record.updatedAt),
        JSON.stringify(record),
        ownerAlias(options),
        String(id),
        claimToken,
      );
      db.exec('COMMIT');
      return result.changes === 1;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  });
}

module.exports = {
  initializeTaskGoal,
  transitionTaskGoal,
  claimTask,
  createClaimRenewer,
  databasePath,
  finishTask,
  importTask,
  listTasks,
  readTask,
  renewClaim,
  writeTask,
};

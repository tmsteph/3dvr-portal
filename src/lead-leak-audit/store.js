import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';

// Private audit requests live in server SQLite outside immutable releases,
// mirroring the automation funnel store (src/automation-funnel/store.js).
export function openAuditStore(path = process.env.LEAD_LEAK_AUDIT_DB || '/opt/3dvr-portal-production/state/lead-leak-audit/requests.sqlite') {
  if (path !== ':memory:') {
    path = resolve(path);
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    chmodSync(dirname(path), 0o700);
  }
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode=WAL;
    PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS requests (
      id TEXT PRIMARY KEY, dedupe TEXT UNIQUE NOT NULL, payload TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS rate_limits (identity TEXT PRIMARY KEY, count INTEGER NOT NULL, reset_at INTEGER NOT NULL);
  `);
  if (path !== ':memory:') chmodSync(path, 0o600);
  const row = r => r ? { ...JSON.parse(r.payload), id: r.id, createdAt: r.created_at } : null;
  const identity = request => createHash('sha256').update(
    'audit:' + request.email + ':' + request.business.toLowerCase() + ':' + request.phone
  ).digest('hex');
  return {
    db,
    list() { return db.prepare('SELECT * FROM requests ORDER BY created_at DESC LIMIT 500').all().map(row); },
    get(id) { return row(db.prepare('SELECT * FROM requests WHERE id=?').get(id)); },
    insert(request) {
      const key = identity(request);
      const existing = db.prepare('SELECT * FROM requests WHERE dedupe=?').get(key);
      if (existing) return { request: row(existing), duplicate: true };
      const id = randomUUID();
      const now = new Date().toISOString();
      db.prepare('INSERT INTO requests VALUES (?, ?, ?, ?)').run(id, key, JSON.stringify({ ...request, notified: false }), now);
      return { request: this.get(id), duplicate: false };
    },
    markNotified(id) {
      const current = this.get(id);
      if (!current) return null;
      const { id: _id, createdAt: _createdAt, ...payload } = current;
      db.prepare('UPDATE requests SET payload=? WHERE id=?').run(JSON.stringify({ ...payload, notified: true }), id);
      return this.get(id);
    },
    rateLimit(key, { limit = 5, windowMs = 3600000 } = {}) {
      const now = Date.now();
      db.prepare('DELETE FROM rate_limits WHERE reset_at <= ?').run(now);
      const old = db.prepare('SELECT * FROM rate_limits WHERE identity=?').get(key);
      if (old && old.count >= limit) return false;
      db.prepare('INSERT INTO rate_limits VALUES (?, 1, ?) ON CONFLICT(identity) DO UPDATE SET count=count+1').run(key, now + windowMs);
      return true;
    },
    close() { db.close(); }
  };
}

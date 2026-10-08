import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';

export function openFunnelStore(path = process.env.AUTOMATION_FUNNEL_DB || '/opt/3dvr-portal-production/state/automation-funnel/leads.sqlite') {
  if (path !== ':memory:') {
    path = resolve(path);
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    chmodSync(dirname(path), 0o700);
  }
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode=WAL;
    PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS leads (
      id TEXT PRIMARY KEY, dedupe TEXT UNIQUE NOT NULL, payload TEXT NOT NULL,
      version INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS rate_limits (identity TEXT PRIMARY KEY, count INTEGER NOT NULL, reset_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS actions (request_id TEXT PRIMARY KEY, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, lead_id TEXT NOT NULL, kind TEXT NOT NULL, created_at TEXT NOT NULL);
  `);
  if (path !== ':memory:') chmodSync(path, 0o600);
  const row = r => r ? { ...JSON.parse(r.payload), id: r.id, version: r.version, createdAt: r.created_at, updatedAt: r.updated_at } : null;
  const identity = lead => createHash('sha256').update(
    lead.origin === 'inbound' ? 'inbound:' + lead.email + ':' + lead.business.toLowerCase() + ':' + lead.problem.toLowerCase()
      : lead.sourceUrl || 'manual:' + lead.business.toLowerCase() + ':' + lead.email
  ).digest('hex');
  return {
    db,
    list() { return db.prepare('SELECT * FROM leads ORDER BY updated_at DESC LIMIT 500').all().map(row); },
    get(id) { return row(db.prepare('SELECT * FROM leads WHERE id=?').get(id)); },
    insert(lead) {
      const key = identity(lead);
      const existing = db.prepare('SELECT * FROM leads WHERE dedupe=?').get(key);
      if (existing) return { lead: row(existing), duplicate: true };
      const id = randomUUID();
      const now = new Date().toISOString();
      db.prepare('INSERT INTO leads VALUES (?, ?, ?, 1, ?, ?)').run(id, key, JSON.stringify(lead), now, now);
      db.prepare('INSERT INTO events VALUES (?, ?, ?, ?)').run(randomUUID(), id, 'created', now);
      return { lead: this.get(id), duplicate: false };
    },
    update(id, lead, version) {
      const now = new Date().toISOString();
      const result = db.prepare('UPDATE leads SET payload=?, version=version+1, updated_at=? WHERE id=? AND version=?').run(JSON.stringify(lead), now, id, version);
      if (!result.changes) throw Object.assign(new Error('Record changed. Refresh before saving.'), { statusCode: 409 });
      db.prepare('INSERT INTO events VALUES (?, ?, ?, ?)').run(randomUUID(), id, 'updated:' + lead.stage, now);
      return this.get(id);
    },
    consumeAction(id) {
      if (!/^[a-zA-Z0-9-]{16,100}$/.test(id || '')) return false;
      db.prepare('DELETE FROM actions WHERE created_at < ?').run(new Date(Date.now() - 86400000).toISOString());
      return Boolean(db.prepare('INSERT OR IGNORE INTO actions VALUES (?, ?)').run(id, new Date().toISOString()).changes);
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

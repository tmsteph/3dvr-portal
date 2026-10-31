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
  // Public discovery feeds can link the same n8n topic through different
  // slugs, reply pages, or locale parameters. Dedupe by immutable topic ID,
  // not by presentation URL; never collapse distinct topics or other hosts.
  const discoveryIdentity = sourceUrl => {
    if (!sourceUrl) return '';
    try {
      const url = new URL(sourceUrl);
      // Upwork links often refer to the same public job under a renamed slug,
      // tracking parameters or its short /jobs/~ID route. Dedupe the stable
      // numeric job ID, not the URL; do not conflate unrelated job IDs or hosts.
      if (url.hostname === 'upwork.com' || url.hostname === 'www.upwork.com') {
        const match = url.pathname.match(/^\/(?:jobs\/~|freelance-jobs\/apply\/[^/?#]*_~)(\d{12,25})(?:\/|$)/);
        if (match) return 'upwork-job:' + match[1];
      }
      if (url.hostname === 'community.n8n.io') {
        const parts = url.pathname.split('/').filter(Boolean);
        const idIndex = /^\d+$/.test(parts[1] || '') ? 1 : 2;
        if (parts[0] === 't' && /^\d+$/.test(parts[idIndex] || '') &&
            (parts.length === idIndex + 1 ||
              (parts.length === idIndex + 2 && /^\d+$/.test(parts[idIndex + 1])))) {
          return 'n8n-topic:' + parts[idIndex];
        }
      }
    } catch { /* Keep malformed/manual sources distinct. */ }
    return sourceUrl;
  };
  const identity = lead => createHash('sha256').update(
    lead.origin === 'inbound' ? (lead.inquiryType === 'operator-pilot' ? 'operator-pilot:' : 'inbound:') + lead.email + ':' + lead.business.toLowerCase() + ':' + lead.problem.toLowerCase()
      : discoveryIdentity(lead.sourceUrl) || 'manual:' + lead.business.toLowerCase() + ':' + lead.email
  ).digest('hex');
  return {
    db,
    list() { return db.prepare('SELECT * FROM leads ORDER BY updated_at DESC LIMIT 500').all().map(row); },
    get(id) { return row(db.prepare('SELECT * FROM leads WHERE id=?').get(id)); },
    insert(lead) {
      const key = identity(lead);
      // Concurrent discovery workers can race after a SELECT and both try to
      // create the same lead. Reserve dedupe identity atomically in SQLite;
      // only the winning insert may record a new-lead event.
      const id = randomUUID();
      const now = new Date().toISOString();
      // A lead without its creation event is an untraceable CRM write.
      // Reserve identity and record the event in one SQLite transaction so a
      // failed event write cannot leave a permanent, silently deduped lead.
      db.exec('BEGIN IMMEDIATE');
      try {
        // Existing deployments may hold URL-hashed Upwork leads from before
        // stable job IDs were introduced. Reuse the original row rather than
        // silently creating a second prospect under the new dedupe key.
        // This is a read-only compatibility lookup inside the insert lock:
        // no migration, rewrite, outreach or duplicate creation event.
        const canonicalSource = lead.origin === 'inbound' ? '' : discoveryIdentity(lead.sourceUrl);
        const upworkId = /^upwork-job:(\\d{12,25})$/.exec(canonicalSource);
        if (upworkId) {
          const candidates = db.prepare('SELECT * FROM leads WHERE payload LIKE ?')
            .all('%' + upworkId[1] + '%');
          const matches = candidates.filter(candidate => {
            try {
              const prior = JSON.parse(candidate.payload);
              return prior.origin !== 'inbound' && discoveryIdentity(prior.sourceUrl) === canonicalSource;
            } catch { return false; }
          });
          // Historical duplicate rows need a reviewed reconciliation. Never
          // guess which record owns follow-up state or message approvals.
          if (matches.length > 1) {
            throw new Error('Ambiguous historical Upwork job leads; review before inserting');
          }
          if (matches.length === 1) {
            db.exec('COMMIT');
            return { lead: row(matches[0]), duplicate: true };
          }
        }
        const inserted = db.prepare('INSERT OR IGNORE INTO leads VALUES (?, ?, ?, 1, ?, ?)')
          .run(id, key, JSON.stringify(lead), now, now);
        const saved = db.prepare('SELECT * FROM leads WHERE dedupe=?').get(key);
        if (!saved) throw new Error('Lead dedupe result could not be verified');
        if (inserted.changes) {
          db.prepare('INSERT INTO events VALUES (?, ?, ?, ?)').run(randomUUID(), id, 'created', now);
        }
        db.exec('COMMIT');
        return { lead: row(saved), duplicate: !inserted.changes };
      } catch (error) {
        try { db.exec('ROLLBACK'); } catch { /* Preserve the original failure. */ }
        throw error;
      }
    },
    update(id, lead, version) {
      const now = new Date().toISOString();
      // A CRM state change without its audit event can falsely imply that a
      // follow-up, approval, or other transition was recorded. Commit both
      // writes together, or preserve the original lead and version.
      db.exec('BEGIN IMMEDIATE');
      try {
        const result = db.prepare('UPDATE leads SET payload=?, version=version+1, updated_at=? WHERE id=? AND version=?').run(JSON.stringify(lead), now, id, version);
        if (!result.changes) throw Object.assign(new Error('Record changed. Refresh before saving.'), { statusCode: 409 });
        db.prepare('INSERT INTO events VALUES (?, ?, ?, ?)').run(randomUUID(), id, 'updated:' + lead.stage, now);
        db.exec('COMMIT');
        return this.get(id);
      } catch (error) {
        try { db.exec('ROLLBACK'); } catch { /* Preserve the original failure. */ }
        throw error;
      }
    },
    consumeAction(id) {
      if (!/^[a-zA-Z0-9-]{16,100}$/.test(id || '')) return false;
      db.prepare('DELETE FROM actions WHERE created_at < ?').run(new Date(Date.now() - 86400000).toISOString());
      return Boolean(db.prepare('INSERT OR IGNORE INTO actions VALUES (?, ?)').run(id, new Date().toISOString()).changes);
    },
    rateLimit(key, { limit = 5, windowMs = 3600000 } = {}) {
      const now = Date.now();
      db.prepare('DELETE FROM rate_limits WHERE reset_at <= ?').run(now);
      // Admission must be one atomic SQLite statement. A SELECT followed by
      // an unconditional increment lets concurrent discovery/submission
      // workers both consume the last slot and exceed the configured cap.
      // An expired window starts again at one; an active full window is denied.
      // Successful requests inside a window must not keep moving its deadline.
      return Boolean(db.prepare(`
        INSERT INTO rate_limits (identity, count, reset_at) VALUES (?, 1, ?)
        ON CONFLICT(identity) DO UPDATE SET
          count = CASE WHEN rate_limits.reset_at <= ? THEN 1 ELSE rate_limits.count + 1 END,
          reset_at = CASE WHEN rate_limits.reset_at <= ?
            THEN excluded.reset_at ELSE rate_limits.reset_at END
        WHERE rate_limits.reset_at <= ? OR rate_limits.count < ?
      `).run(key, now + windowMs, now, now, now, limit).changes);
    },
    close() { db.close(); }
  };
}

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { DatabaseSync } = require('node:sqlite');

const STATES = new Set(['prospect', 'verified', 'drafted', 'eligible', 'sent', 'bounced', 'replied', 'suppressed', 'failed']);
const TRANSITIONS = {
  prospect: new Set(['verified', 'suppressed', 'failed']),
  verified: new Set(['drafted', 'eligible', 'suppressed', 'failed']),
  drafted: new Set(['eligible', 'suppressed', 'failed']),
  eligible: new Set(['sent', 'suppressed', 'failed']),
  sent: new Set(['bounced', 'replied', 'suppressed', 'failed']),
  bounced: new Set(['suppressed']),
  replied: new Set(['suppressed']),
  suppressed: new Set(),
  failed: new Set(['prospect', 'verified', 'drafted', 'eligible', 'suppressed']),
};

function normalize(value) {
  return String(value || '').trim();
}

function resolveLedgerPath(filePath = process.env.THREEDVR_REVENUE_LEDGER_FILE) {
  return normalize(filePath) || path.join(process.env.THREEDVR_AUTOPILOT_STATE_DIR || path.join(process.cwd(), 'state'), 'revenue-ledger.sqlite');
}

function openLedger(options = {}) {
  const filePath = resolveLedgerPath(options.filePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const db = new DatabaseSync(filePath);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS prospects (
      id TEXT PRIMARY KEY,
      contact_key TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      source_url TEXT NOT NULL DEFAULT '',
      contact TEXT NOT NULL DEFAULT '',
      state TEXT NOT NULL CHECK (state IN ('prospect','verified','drafted','eligible','sent','bounced','replied','suppressed','failed')),
      campaign_id TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS revenue_events (
      id TEXT PRIMARY KEY,
      idempotency_key TEXT NOT NULL UNIQUE,
      prospect_id TEXT NOT NULL REFERENCES prospects(id),
      type TEXT NOT NULL,
      from_state TEXT NOT NULL DEFAULT '',
      to_state TEXT NOT NULL DEFAULT '',
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS revenue_runs (
      id TEXT PRIMARY KEY,
      trigger_id TEXT NOT NULL UNIQUE,
      release_sha TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('running','succeeded','failed')),
      started_at TEXT NOT NULL,
      finished_at TEXT NOT NULL DEFAULT '',
      summary_json TEXT NOT NULL DEFAULT '{}'
    );
    CREATE TABLE IF NOT EXISTS delivery_attempts (
      id TEXT PRIMARY KEY,
      attempt_key TEXT NOT NULL UNIQUE,
      prospect_id TEXT NOT NULL REFERENCES prospects(id),
      status TEXT NOT NULL CHECK (status IN ('in_flight','acknowledged','failed')),
      message_id TEXT NOT NULL DEFAULT '',
      transport TEXT NOT NULL DEFAULT '',
      error TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS projection_outbox (
      id TEXT PRIMARY KEY,
      idempotency_key TEXT NOT NULL UNIQUE,
      prospect_id TEXT NOT NULL REFERENCES prospects(id),
      event_id TEXT NOT NULL REFERENCES revenue_events(id),
      destination TEXT NOT NULL CHECK (destination IN ('crm')),
      payload_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','succeeded','failed')),
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    -- A durable single-writer reservation for an external CRM side effect.
    -- Expiration is diagnostic only: a timed-out worker might already have
    -- written remotely, so an expired claim is NEVER automatically stolen.
    CREATE TABLE IF NOT EXISTS projection_claims (
      outbox_id TEXT PRIMARY KEY REFERENCES projection_outbox(id),
      owner_token TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('in_flight','needs_review','finished')),
      claimed_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  return db;
}

function reserveDeliveryAttempt(db, { attemptId, prospectId } = {}) {
  const key = normalize(attemptId);
  const prospect = normalize(prospectId);
  if (!key || !prospect) throw new Error('attemptId and prospectId are required');
  const existing = db.prepare('SELECT * FROM delivery_attempts WHERE attempt_key = ?').get(key);
  if (existing) {
    // A delivery attempt key belongs to exactly one prospect. Reusing it for
    // another recipient must never return a misleading acknowledged receipt.
    if (existing.prospect_id !== prospect) {
      throw new Error('Delivery attempt key collision: existing attempt belongs to another prospect');
    }
    return { attempt: existing, replayed: true };
  }
  const now = new Date().toISOString();
  const attempt = {
    id: randomUUID(), attempt_key: key, prospect_id: prospect, status: 'in_flight',
    message_id: '', transport: '', error: '', created_at: now, updated_at: now,
  };
  db.prepare(`INSERT INTO delivery_attempts
    (id, attempt_key, prospect_id, status, message_id, transport, error, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(...Object.values(attempt));
  return { attempt, replayed: false };
}

function finishDeliveryAttempt(db, { attemptId, status, messageId = '', transport = '', error = '' } = {}) {
  if (!['acknowledged', 'failed'].includes(status)) throw new Error('delivery status must be acknowledged or failed');
  // A successful send must never be counted without a transport receipt
  // identifier. These fields are structural evidence only: an authenticated
  // provider read-back remains mandatory before re-enabling outbound delivery.
  if (status === 'acknowledged' && (!normalize(messageId) || !normalize(transport))) {
    throw new Error('Acknowledged delivery requires messageId and transport');
  }
  const result = db.prepare(`UPDATE delivery_attempts
    SET status = ?, message_id = ?, transport = ?, error = ?, updated_at = ?
    WHERE attempt_key = ? AND status = 'in_flight'
      AND (? <> 'acknowledged' OR NOT EXISTS (
        SELECT 1 FROM delivery_attempts prior
        WHERE prior.status = 'acknowledged' AND prior.message_id = ? AND prior.transport = ?
      ))`)
    .run(status, normalize(messageId), normalize(transport), normalize(error), new Date().toISOString(),
      normalize(attemptId), status, normalize(messageId), normalize(transport));
  if (!result.changes) {
    // The atomic predicate prevents two different attempt keys from claiming
    // the same provider receipt, even when workers race on the same SQLite DB.
    if (status === 'acknowledged' && db.prepare(`SELECT 1 FROM delivery_attempts
      WHERE status = 'acknowledged' AND message_id = ? AND transport = ?`)
      .get(normalize(messageId), normalize(transport))) {
      throw new Error('Delivery provider receipt collision: already acknowledged');
    }
    throw new Error('Delivery attempt was not in flight');
  }
  return db.prepare('SELECT * FROM delivery_attempts WHERE attempt_key = ?').get(normalize(attemptId));
}

function acknowledgedDeliveryCount(db, { since = '', campaignId = '' } = {}) {
  const values = [normalize(since)];
  let campaign = '';
  if (normalize(campaignId)) {
    campaign = ' AND p.campaign_id = ?';
    values.push(normalize(campaignId));
  }
  return db.prepare(`SELECT COUNT(DISTINCT d.transport || char(0) || d.message_id) AS total FROM delivery_attempts d
    JOIN prospects p ON p.id = d.prospect_id
    WHERE d.status = 'acknowledged' AND d.message_id <> '' AND d.transport <> '' AND d.updated_at >= ?${campaign}`).get(...values).total;
}

function contactKey({ contact, sourceUrl, name } = {}) {
  const contactValue = normalize(contact).toLowerCase();
  // Canonicalize mailto: emails without losing support for historical keys.
  const email = contactValue.replace(/^mailto:/, '');
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return `contact:${email}`;
  if (contactValue) return `contact:${contactValue}`;
  return `source:${normalize(sourceUrl).toLowerCase()}|name:${normalize(name).toLowerCase()}`;
}

function getProspect(db, id) {
  return db.prepare('SELECT * FROM prospects WHERE id = ?').get(id) || null;
}

function createProspect(db, input = {}) {
  const now = new Date().toISOString();
  const key = contactKey(input);
  // Reserve the SQLite writer before deduplication. Two discovery workers
  // must not both see an absent contact and race to insert it; the loser
  // should reuse the existing lead, including historical mailto: keys.
  db.exec('BEGIN IMMEDIATE');
  try {
    const existing = (normalize(input.contact) ? findProspectByContact(db, input.contact) : null)
      || db.prepare('SELECT * FROM prospects WHERE contact_key = ?').get(key);
    if (existing) {
      db.exec('COMMIT');
      return { prospect: existing, created: false };
    }
    const prospect = {
      id: normalize(input.id) || randomUUID(), contact_key: key, name: normalize(input.name) || 'Unknown',
      source_url: normalize(input.sourceUrl), contact: normalize(input.contact), state: 'prospect',
      campaign_id: normalize(input.campaignId), created_at: now, updated_at: now,
    };
    db.prepare(`INSERT INTO prospects (id, contact_key, name, source_url, contact, state, campaign_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(...Object.values(prospect));
    db.exec('COMMIT');
    return { prospect, created: true };
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

// An idempotency key identifies one exact ledger event, not merely a matching
// string. Never return a different prospect's receipt as a successful replay.
function replayLedgerEvent(db, { idempotencyKey, prospectId, toState, type, payload }) {
  const replay = db.prepare('SELECT * FROM revenue_events WHERE idempotency_key = ?').get(idempotencyKey);
  if (!replay) return null;
  let storedPayload;
  try { storedPayload = JSON.parse(replay.payload_json); }
  catch { throw new Error('Idempotency key collision: stored event payload is invalid'); }
  if (replay.prospect_id !== prospectId || replay.to_state !== toState ||
      replay.type !== type || !isDeepStrictEqual(storedPayload, payload)) {
    throw new Error('Idempotency key collision: existing event differs from requested prospect, state, type, or payload');
  }
  return replay;
}

function transitionProspect(db, input = {}) {
  const id = normalize(input.prospectId);
  const toState = normalize(input.toState);
  const idempotencyKey = normalize(input.idempotencyKey);
  if (!id || !STATES.has(toState) || !idempotencyKey) throw new Error('prospectId, valid toState, and idempotencyKey are required');
  const type = normalize(input.type) || 'state_transition';
  const payload = input.payload || {};
  // Read and validate the state under the same write reservation as the
  // update. Otherwise another worker can advance a prospect between them.
  db.exec('BEGIN IMMEDIATE');
  try {
    const replay = replayLedgerEvent(db, { idempotencyKey, prospectId: id, toState, type, payload });
    if (replay) {
      db.exec('COMMIT');
      return { event: replay, replayed: true, prospect: getProspect(db, id) };
    }
    const prospect = getProspect(db, id);
    if (!prospect) throw new Error(`Unknown prospect: ${id}`);
    if (!TRANSITIONS[prospect.state].has(toState)) throw new Error(`Invalid transition: ${prospect.state} -> ${toState}`);
    const now = new Date().toISOString();
    const event = { id: randomUUID(), idempotency_key: idempotencyKey, prospect_id: id, type, from_state: prospect.state, to_state: toState, payload_json: JSON.stringify(payload), created_at: now };
    db.prepare('UPDATE prospects SET state = ?, updated_at = ? WHERE id = ?').run(toState, now, id);
    db.prepare(`INSERT INTO revenue_events (id, idempotency_key, prospect_id, type, from_state, to_state, payload_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(...Object.values(event));
    db.prepare(`INSERT INTO projection_outbox (id, idempotency_key, prospect_id, event_id, destination, payload_json, status, attempts, last_error, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'crm', ?, 'pending', 0, '', ?, ?)`)
      .run(randomUUID(), `crm:${idempotencyKey}`, id, event.id, JSON.stringify({ prospectId: id, state: toState, eventId: event.id }), now, now);
    db.exec('COMMIT');
    return { event, replayed: false, prospect: getProspect(db, id) };
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}

function startRun(db, { triggerId, releaseSha } = {}) {
  const trigger = normalize(triggerId);
  if (!trigger) throw new Error('triggerId is required');
  // A pre-read followed by INSERT races when two schedulers start the same
  // trigger. Reserve it in one SQLite statement; only the winner may execute.
  const run = { id: randomUUID(), trigger_id: trigger, release_sha: normalize(releaseSha) || 'unknown', status: 'running', started_at: new Date().toISOString(), finished_at: '', summary_json: '{}' };
  const inserted = db.prepare('INSERT OR IGNORE INTO revenue_runs (id, trigger_id, release_sha, status, started_at, finished_at, summary_json) VALUES (?, ?, ?, ?, ?, ?, ?)').run(...Object.values(run));
  if (inserted.changes) return { run, replayed: false };
  const replay = db.prepare('SELECT * FROM revenue_runs WHERE trigger_id = ?').get(trigger);
  if (!replay) throw new Error('Revenue trigger reservation could not be verified');
  return { run: replay, replayed: true };
}

function finishRun(db, { runId, status, summary } = {}) {
  if (!['succeeded', 'failed'].includes(status)) throw new Error('status must be succeeded or failed');
  const result = db.prepare('UPDATE revenue_runs SET status = ?, finished_at = ?, summary_json = ? WHERE id = ? AND status = ?')
    .run(status, new Date().toISOString(), JSON.stringify(summary || {}), normalize(runId), 'running');
  if (!result.changes) throw new Error('Run was not active or does not exist');
  return db.prepare('SELECT * FROM revenue_runs WHERE id = ?').get(normalize(runId));
}

function findProspectByContact(db, contact) {
  const value = normalize(contact);
  if (!value) return null;
  const canonicalKey = contactKey({ contact: value });
  const keys = [canonicalKey];
  // Existing databases can still contain the pre-canonicalization mailto: key.
  if (/^contact:[^\s@]+@[^\s@]+\.[^\s@]+$/.test(canonicalKey)) {
    keys.push(`contact:mailto:${canonicalKey.slice('contact:'.length)}`);
  }
  return db.prepare(`SELECT * FROM prospects WHERE contact_key IN (${keys.map(() => '?').join(',')})
    ORDER BY CASE WHEN contact_key = ? THEN 0 ELSE 1 END LIMIT 1`).get(...keys, canonicalKey) || null;
}

function pendingProjections(db, limit = 100) {
  // Failed/ambiguous external writes require reconciliation, not replay.
  // Claims are durable even after lease expiry: the remote write may have landed.
  return db.prepare(`SELECT o.* FROM projection_outbox o
    JOIN revenue_events e ON e.id = o.event_id
    WHERE o.status = 'pending'
      AND NOT EXISTS (SELECT 1 FROM projection_claims c WHERE c.outbox_id = o.id)
    ORDER BY e.rowid ASC, o.rowid ASC LIMIT ?`)
    .all(Math.max(1, Number(limit) || 100));
}

function claimProjection(db, { id, leaseMs = 60000 } = {}) {
  const outboxId = normalize(id);
  if (!outboxId) throw new Error('projection id is required');
  const duration = Number(leaseMs);
  if (!Number.isSafeInteger(duration) || duration < 1) throw new Error('leaseMs must be a positive integer');
  const now = new Date();
  const token = randomUUID();
  // INSERT...SELECT is one atomic SQLite statement across worker processes.
  // Earlier events for the same prospect must succeed before a later write.
  const result = db.prepare(`INSERT OR IGNORE INTO projection_claims
    (outbox_id, owner_token, status, claimed_at, expires_at, updated_at)
    SELECT o.id, ?, 'in_flight', ?, ?, ?
    FROM projection_outbox o JOIN revenue_events current_event ON current_event.id = o.event_id
    WHERE o.id = ? AND o.status = 'pending'
      AND NOT EXISTS (SELECT 1 FROM projection_claims c WHERE c.outbox_id = o.id)
      AND NOT EXISTS (
        SELECT 1 FROM projection_outbox older
        JOIN revenue_events prior_event ON prior_event.id = older.event_id
        WHERE older.prospect_id = o.prospect_id
          AND prior_event.rowid < current_event.rowid
          AND older.status != 'succeeded'
      )`).run(token, now.toISOString(), new Date(now.getTime() + duration).toISOString(), now.toISOString(), outboxId);
  return result.changes ? { id: outboxId, ownerToken: token } : null;
}

function finishClaimedProjection(db, { id, ownerToken, status, error = '' } = {}) {
  if (!['succeeded', 'failed'].includes(status)) throw new Error('projection status must be succeeded or failed');
  const outboxId = normalize(id);
  const token = normalize(ownerToken);
  if (!outboxId || !token) throw new Error('projection id and owner token are required');
  db.exec('BEGIN IMMEDIATE');
  try {
    const claim = db.prepare('SELECT * FROM projection_claims WHERE outbox_id = ?').get(outboxId);
    if (!claim || claim.owner_token !== token || claim.status !== 'in_flight') {
      throw new Error('Projection claim missing, stale, or owned by another worker');
    }
    const now = new Date().toISOString();
    const result = db.prepare(`UPDATE projection_outbox
      SET status = ?, attempts = attempts + 1, last_error = ?, updated_at = ?
      WHERE id = ? AND status = 'pending'`)
      .run(status, normalize(error), now, outboxId);
    if (!result.changes) throw new Error('Projection already finalized or missing');
    // A failed or uncertain external ACK must be manually reconciled.
    // Never release its claim for automatic retry.
    db.prepare('UPDATE projection_claims SET status = ?, updated_at = ? WHERE outbox_id = ?')
      .run(status === 'succeeded' ? 'finished' : 'needs_review', now, outboxId);
    db.exec('COMMIT');
    return db.prepare('SELECT * FROM projection_outbox WHERE id = ?').get(outboxId);
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function finishProjection(db, { id, status, error = '' } = {}) {
  // Legacy/manual reconciliation path; live workers MUST use the claim token.
  if (!['succeeded', 'failed'].includes(status)) throw new Error('projection status must be succeeded or failed');
  const result = db.prepare(`UPDATE projection_outbox
    SET status = ?, attempts = attempts + 1, last_error = ?, updated_at = ?
    WHERE id = ? AND status IN ('pending','failed')
      AND NOT EXISTS (SELECT 1 FROM projection_claims c WHERE c.outbox_id = projection_outbox.id)`)
    .run(status, normalize(error), new Date().toISOString(), normalize(id));
  if (!result.changes) throw new Error('Projection already succeeded, claimed, or does not exist');
  return db.prepare('SELECT * FROM projection_outbox WHERE id = ?').get(normalize(id));
}

// Imports are an auditable backfill, not normal lifecycle transitions. A legacy
// CSV only tells us its current outcome; it must not invent historical events.
function importProspectState(db, input = {}) {
  const id = normalize(input.prospectId);
  const toState = normalize(input.toState);
  const idempotencyKey = normalize(input.idempotencyKey);
  if (!id || !STATES.has(toState) || !idempotencyKey) throw new Error('prospectId, valid toState, and idempotencyKey are required');
  const payload = input.payload || {};
  // Imports must validate the current state while holding the SQLite write
  // reservation. A concurrent worker may have advanced this prospect since
  // an earlier read; importing over it would regress the canonical CRM state.
  db.exec('BEGIN IMMEDIATE');
  try {
    const replay = replayLedgerEvent(db, { idempotencyKey, prospectId: id, toState, type: 'legacy_import', payload });
    if (replay) {
      const prospect = getProspect(db, id);
      db.exec('COMMIT');
      return { event: replay, replayed: true, prospect };
    }
    const prospect = getProspect(db, id);
    if (!prospect) throw new Error(`Unknown prospect: ${id}`);
    if (prospect.state !== 'prospect' && prospect.state !== toState) throw new Error(`Cannot import ${toState} over existing ${prospect.state} state`);
    if (prospect.state === toState) {
      db.exec('COMMIT');
      return { event: null, replayed: true, prospect };
    }
    const now = new Date().toISOString();
    const event = { id: randomUUID(), idempotency_key: idempotencyKey, prospect_id: id, type: 'legacy_import', from_state: prospect.state, to_state: toState, payload_json: JSON.stringify(payload), created_at: now };
    db.prepare('UPDATE prospects SET state = ?, updated_at = ? WHERE id = ?').run(toState, now, id);
    db.prepare(`INSERT INTO revenue_events (id, idempotency_key, prospect_id, type, from_state, to_state, payload_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(...Object.values(event));
    db.prepare(`INSERT INTO projection_outbox (id, idempotency_key, prospect_id, event_id, destination, payload_json, status, attempts, last_error, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'crm', ?, 'pending', 0, '', ?, ?)`)
      .run(randomUUID(), `crm:${idempotencyKey}`, id, event.id, JSON.stringify({ prospectId: id, state: toState, eventId: event.id, source: 'legacy_import' }), now, now);
    const updatedProspect = getProspect(db, id);
    db.exec('COMMIT');
    return { event, replayed: false, prospect: updatedProspect };
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}

module.exports = { STATES, TRANSITIONS, acknowledgedDeliveryCount, claimProjection, finishClaimedProjection, contactKey, createProspect, findProspectByContact, finishDeliveryAttempt, finishProjection, finishRun, getProspect, importProspectState, openLedger, pendingProjections, reserveDeliveryAttempt, resolveLedgerPath, startRun, transitionProspect };

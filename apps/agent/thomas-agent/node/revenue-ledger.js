const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
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
  `);
  return db;
}

function contactKey({ contact, sourceUrl, name } = {}) {
  const contactValue = normalize(contact).toLowerCase();
  if (contactValue) return `contact:${contactValue}`;
  return `source:${normalize(sourceUrl).toLowerCase()}|name:${normalize(name).toLowerCase()}`;
}

function getProspect(db, id) {
  return db.prepare('SELECT * FROM prospects WHERE id = ?').get(id) || null;
}

function createProspect(db, input = {}) {
  const now = new Date().toISOString();
  const key = contactKey(input);
  const existing = db.prepare('SELECT * FROM prospects WHERE contact_key = ?').get(key);
  if (existing) return { prospect: existing, created: false };
  const prospect = {
    id: normalize(input.id) || randomUUID(), contact_key: key, name: normalize(input.name) || 'Unknown',
    source_url: normalize(input.sourceUrl), contact: normalize(input.contact), state: 'prospect',
    campaign_id: normalize(input.campaignId), created_at: now, updated_at: now,
  };
  db.prepare(`INSERT INTO prospects (id, contact_key, name, source_url, contact, state, campaign_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(...Object.values(prospect));
  return { prospect, created: true };
}

function transitionProspect(db, input = {}) {
  const id = normalize(input.prospectId);
  const toState = normalize(input.toState);
  const idempotencyKey = normalize(input.idempotencyKey);
  if (!id || !STATES.has(toState) || !idempotencyKey) throw new Error('prospectId, valid toState, and idempotencyKey are required');
  const replay = db.prepare('SELECT * FROM revenue_events WHERE idempotency_key = ?').get(idempotencyKey);
  if (replay) return { event: replay, replayed: true, prospect: getProspect(db, id) };
  const prospect = getProspect(db, id);
  if (!prospect) throw new Error(`Unknown prospect: ${id}`);
  if (!TRANSITIONS[prospect.state].has(toState)) throw new Error(`Invalid transition: ${prospect.state} -> ${toState}`);
  const now = new Date().toISOString();
  const event = { id: randomUUID(), idempotency_key: idempotencyKey, prospect_id: id, type: normalize(input.type) || 'state_transition', from_state: prospect.state, to_state: toState, payload_json: JSON.stringify(input.payload || {}), created_at: now };
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('UPDATE prospects SET state = ?, updated_at = ? WHERE id = ?').run(toState, now, id);
    db.prepare(`INSERT INTO revenue_events (id, idempotency_key, prospect_id, type, from_state, to_state, payload_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(...Object.values(event));
    db.prepare(`INSERT INTO projection_outbox (id, idempotency_key, prospect_id, event_id, destination, payload_json, status, attempts, last_error, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'crm', ?, 'pending', 0, '', ?, ?)`)
      .run(randomUUID(), `crm:${idempotencyKey}`, id, event.id, JSON.stringify({ prospectId: id, state: toState, eventId: event.id }), now, now);
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  return { event, replayed: false, prospect: getProspect(db, id) };
}

function startRun(db, { triggerId, releaseSha } = {}) {
  const trigger = normalize(triggerId);
  if (!trigger) throw new Error('triggerId is required');
  const replay = db.prepare('SELECT * FROM revenue_runs WHERE trigger_id = ?').get(trigger);
  if (replay) return { run: replay, replayed: true };
  const run = { id: randomUUID(), trigger_id: trigger, release_sha: normalize(releaseSha) || 'unknown', status: 'running', started_at: new Date().toISOString(), finished_at: '', summary_json: '{}' };
  db.prepare('INSERT INTO revenue_runs (id, trigger_id, release_sha, status, started_at, finished_at, summary_json) VALUES (?, ?, ?, ?, ?, ?, ?)').run(...Object.values(run));
  return { run, replayed: false };
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
  const keys = [contactKey({ contact: value })];
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) keys.push(contactKey({ contact: `mailto:${value}` }));
  if (/^mailto:/i.test(value)) keys.push(contactKey({ contact: value.replace(/^mailto:/i, '') }));
  return db.prepare(`SELECT * FROM prospects WHERE contact_key IN (${keys.map(() => '?').join(',')}) LIMIT 1`).get(...new Set(keys)) || null;
}

function pendingProjections(db, limit = 100) {
  return db.prepare("SELECT * FROM projection_outbox WHERE status IN ('pending','failed') ORDER BY created_at, id LIMIT ?")
    .all(Math.max(1, Number(limit) || 100));
}

function finishProjection(db, { id, status, error = '' } = {}) {
  if (!['succeeded', 'failed'].includes(status)) throw new Error('projection status must be succeeded or failed');
  const result = db.prepare(`UPDATE projection_outbox
    SET status = ?, attempts = attempts + 1, last_error = ?, updated_at = ? WHERE id = ?`)
    .run(status, normalize(error), new Date().toISOString(), normalize(id));
  if (!result.changes) throw new Error('Projection does not exist');
  return db.prepare('SELECT * FROM projection_outbox WHERE id = ?').get(normalize(id));
}

// Imports are an auditable backfill, not normal lifecycle transitions. A legacy
// CSV only tells us its current outcome; it must not invent historical events.
function importProspectState(db, input = {}) {
  const id = normalize(input.prospectId);
  const toState = normalize(input.toState);
  const idempotencyKey = normalize(input.idempotencyKey);
  if (!id || !STATES.has(toState) || !idempotencyKey) throw new Error('prospectId, valid toState, and idempotencyKey are required');
  const replay = db.prepare('SELECT * FROM revenue_events WHERE idempotency_key = ?').get(idempotencyKey);
  if (replay) return { event: replay, replayed: true, prospect: getProspect(db, id) };
  const prospect = getProspect(db, id);
  if (!prospect) throw new Error(`Unknown prospect: ${id}`);
  if (prospect.state !== 'prospect' && prospect.state !== toState) throw new Error(`Cannot import ${toState} over existing ${prospect.state} state`);
  if (prospect.state === toState) return { event: null, replayed: true, prospect };
  const now = new Date().toISOString();
  const event = { id: randomUUID(), idempotency_key: idempotencyKey, prospect_id: id, type: 'legacy_import', from_state: prospect.state, to_state: toState, payload_json: JSON.stringify(input.payload || {}), created_at: now };
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('UPDATE prospects SET state = ?, updated_at = ? WHERE id = ?').run(toState, now, id);
    db.prepare(`INSERT INTO revenue_events (id, idempotency_key, prospect_id, type, from_state, to_state, payload_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(...Object.values(event));
    db.prepare(`INSERT INTO projection_outbox (id, idempotency_key, prospect_id, event_id, destination, payload_json, status, attempts, last_error, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'crm', ?, 'pending', 0, '', ?, ?)`)
      .run(randomUUID(), `crm:${idempotencyKey}`, id, event.id, JSON.stringify({ prospectId: id, state: toState, eventId: event.id, source: 'legacy_import' }), now, now);
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  return { event, replayed: false, prospect: getProspect(db, id) };
}

module.exports = { STATES, TRANSITIONS, contactKey, createProspect, findProspectByContact, finishProjection, finishRun, getProspect, importProspectState, openLedger, pendingProjections, resolveLedgerPath, startRun, transitionProspect };

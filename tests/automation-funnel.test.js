import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { normalizeLead, draftReply } from '../src/automation-funnel/model.js';
import { openFunnelStore } from '../src/automation-funnel/store.js';
import { createFunnelHandler } from '../src/automation-funnel/handler.js';
import { parseJobFeed } from '../src/automation-funnel/discovery.js';
const base = { name: 'Buyer', business: 'Example Co', email: 'buyer@example.com', problem: 'Fix intake', impact: 'Two hours daily', stack: 'n8n', budget: '600-1499', authority: 'yes', timeline: 'this-month', consent: true };
const response = () => ({ setHeader() {}, status(n) { this.code = n; return this; }, json(data) { this.data = data; return this; } });
test('inbound qualification is derived; cannot spoof paid stage or revenue', () => {
  const lead = normalizeLead({ ...base, stage: 'project-paid', revenue: 999, notes: 'spoof' }, { inbound: true });
  assert.equal(lead.stage, 'qualified'); assert.equal(lead.score, 10); assert.equal(lead.revenue, 0); assert.equal(lead.notes, '');
  assert.equal(normalizeLead({ ...base, budget: 'undecided' }, { inbound: true }).qualified, false);
  assert.throws(() => normalizeLead({ ...base, stage: 'diagnostic-paid' }), /payment reference/);
});
test('durable queue deduplicates and uses version guard', () => {
  const store = openFunnelStore(':memory:');
  const lead = normalizeLead(base, { inbound: true });
  const saved = store.insert(lead).lead;
  assert.equal(store.insert(lead).duplicate, true);
  store.update(saved.id, { ...lead, stage: 'replied' }, saved.version);
  assert.throws(() => store.update(saved.id, lead, saved.version), /changed/);
  assert.equal(store.get(saved.id).stage, 'replied');
  assert.equal(store.consumeAction('12345678-1234-1234-1234-123456789012'), true);
  assert.equal(store.consumeAction('12345678-1234-1234-1234-123456789012'), false);
  store.close();
});
test('concurrent discovery workers reuse the winning lead and record one creation', () => {
  const dir = mkdtempSync(join(tmpdir(), '3dvr-funnel-race-'));
  const dbPath = join(dir, 'leads.sqlite');
  const first = openFunnelStore(dbPath);
  const second = openFunnelStore(dbPath);
  try {
    const lead = normalizeLead({ ...base, business: 'Concurrent Buyer' }, { inbound: true });
    const originalExec = first.db.exec.bind(first.db);
    let winner;
    let interleaved = false;
    first.db.exec = sql => {
      // Another worker commits just before this worker begins its atomic
      // transaction. Deduplication must return that winner without an event.
      if (!interleaved && sql === 'BEGIN IMMEDIATE') {
        interleaved = true;
        winner = second.insert(lead);
      }
      return originalExec(sql);
    };
    const loser = first.insert(lead);
    assert.equal(interleaved, true);
    assert.equal(winner.duplicate, false);
    assert.equal(loser.duplicate, true);
    assert.equal(loser.lead.id, winner.lead.id);
    assert.equal(first.db.prepare('SELECT COUNT(*) AS n FROM leads').get().n, 1);
    assert.equal(first.db.prepare("SELECT COUNT(*) AS n FROM events WHERE kind='created'").get().n, 1);
  } finally {
    first.close();
    second.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test('failed CRM creation-event write rolls back the lead and allows a clean retry', () => {
  const store = openFunnelStore(':memory:');
  try {
    const lead = normalizeLead({ ...base, business: 'Rollback Buyer' }, { inbound: true });
    store.db.exec(`CREATE TRIGGER reject_created BEFORE INSERT ON events
      WHEN NEW.kind = 'created' BEGIN SELECT RAISE(FAIL, 'synthetic event failure'); END;`);
    assert.throws(() => store.insert(lead), /synthetic event failure/);
    assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM leads').get().n, 0,
      'a failed creation event must not leave an untracked CRM lead');
    store.db.exec('DROP TRIGGER reject_created');
    const saved = store.insert(lead);
    assert.equal(saved.duplicate, false, 'retry must create rather than silently dedupe');
    assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM leads').get().n, 1);
    assert.equal(store.db.prepare("SELECT COUNT(*) AS n FROM events WHERE kind='created'").get().n, 1);
  } finally {
    store.close();
  }
});

test('failed CRM update-event write rolls back the lead version and permits a clean retry', () => {
  const store = openFunnelStore(':memory:');
  try {
    const lead = normalizeLead({ ...base, business: 'Update Rollback Buyer' }, { inbound: true });
    const original = store.insert(lead).lead;
    store.db.exec(`CREATE TRIGGER reject_updated BEFORE INSERT ON events
      WHEN NEW.kind LIKE 'updated:%' BEGIN SELECT RAISE(FAIL, 'synthetic update event failure'); END;`);
    assert.throws(() => store.update(original.id, { ...lead, stage: 'replied' }, original.version),
      /synthetic update event failure/);
    assert.equal(store.get(original.id).stage, original.stage,
      'failed event write must not persist an unaudited CRM transition');
    assert.equal(store.get(original.id).version, original.version,
      'failed event write must not consume the optimistic-lock version');
    assert.equal(store.db.prepare("SELECT COUNT(*) AS n FROM events WHERE kind LIKE 'updated:%'").get().n, 0);
    store.db.exec('DROP TRIGGER reject_updated');
    const updated = store.update(original.id, { ...lead, stage: 'replied' }, original.version);
    assert.equal(updated.stage, 'replied');
    assert.equal(updated.version, original.version + 1);
    assert.equal(store.db.prepare("SELECT COUNT(*) AS n FROM events WHERE kind='updated:replied'").get().n, 1);
    assert.throws(() => store.update(original.id, lead, original.version), /Record changed/);
  } finally {
    store.close();
  }
});

test('public submission exposes receipt only and owner review requires bound proof', async () => {
  const store = openFunnelStore(':memory:');
  const config = { PORTAL_ORIGIN: 'https://portal.3dvr.tech', THREEDVR_OPERATOR_OWNER_PUBS: 'owner' };
  const handler = createFunnelHandler({ store, config, verify: async b => b.authPub ? { ok: true, identity: { pub: b.authPub, action: b.action }, verified: { data: b.signedData, requestId: b.requestId } } : { ok: false } });
  let res = response();
  await handler({ method: 'POST', body: { lead: base }, headers: {}, socket: { remoteAddress: '127.0.0.1' } }, res);
  assert.equal(res.code, 201); assert.deepEqual(Object.keys(res.data).sort(), ['ok', 'receipt']);
  res = response(); await handler({ method: 'POST', headers: {}, body: { action: 'list' } }, res); assert.equal(res.code, 401);
  res = response(); await handler({ method: 'POST', headers: {}, body: { action: 'list', data: {}, authPub: 'stranger', signedData: '{}', requestId: '12345678-1234-1234-1234-123456789012' } }, res); assert.equal(res.code, 403);
  res = response(); await handler({ method: 'POST', headers: {}, body: { action: 'list', data: {}, authPub: 'owner', signedData: '{"tampered":true}', requestId: '12345678-1234-1234-1234-123456789012' } }, res); assert.equal(res.code, 403);
  res = response(); await handler({ method: 'POST', headers: {}, body: { action: 'list', data: {}, authPub: 'owner', signedData: '{}', requestId: '12345678-1234-1234-1234-123456789012' } }, res); assert.equal(res.code, 200); assert.equal(res.data.leads.length, 1);
  store.close();
});
test('source discovery rejects sellers and stale posts; never guesses budget', () => {
  const now = Date.parse('2026-10-08T16:00:00Z');
  const item = (title, date) => '<item><title>' + title + '</title><link>https://community.n8n.io/t/example/123</link><pubDate>' + date + '</pubDate><description>Need help</description></item>';
  const leads = parseJobFeed('<rss>' + item('Hiring n8n developer', 'Thu, 08 Oct 2026 10:00:00 GMT') + item('Looking for Remote Work — AI Automation / n8n', 'Thu, 08 Oct 2026 10:00:00 GMT') + item('For hire developer', 'Thu, 08 Oct 2026 10:00:00 GMT') + item('Need engineer', 'Thu, 01 Jan 2026 10:00:00 GMT') + '</rss>', now);
  assert.equal(leads.length, 1); assert.equal(leads[0].budget, 'undecided'); assert.equal(leads[0].qualified, false);
});
test('expert-needed buyer phrasing is discovered without promoting unverified demand', () => {
  const now = Date.parse('2026-10-28T17:00:00Z');
  const item = (title, id, date = 'Fri, 23 Oct 2026 04:25:00 GMT') =>
    '<item><title>' + title + '</title><link>https://community.n8n.io/t/post/' + id +
    '</link><pubDate>' + date + '</pubDate><description>Potential client request; budget unconfirmed.</description></item>';
  const leads = parseJobFeed('<rss>' +
    item('N8n Expert Needed: AI WhatsApp Support Agent (Hindi + English)', '100') +
    item('Automation Specialist Needed for CRM Integration', '101') +
    item('Expert needed for hire — available for your projects', '102') +
    item('Developer Needed for old project', '103', 'Fri, 01 May 2026 04:25:00 GMT') +
    '</rss>', now);
  assert.equal(leads.length, 2);
  assert.deepEqual(leads.map(lead => lead.sourceUrl), [
    'https://community.n8n.io/t/post/100',
    'https://community.n8n.io/t/post/101'
  ]);
  assert.ok(leads.every(lead => lead.budget === 'undecided' && lead.qualified === false && lead.stage === 'discovered'));
});


test('employer For Hire vacancies are discovered but freelancer offers remain excluded', () => {
  const now = Date.parse('2026-10-28T22:00:00Z');
  const item = (title, id) =>
    '<item><title>' + title + '</title><link>https://community.n8n.io/t/post/' + id +
    '</link><pubDate>Wed, 28 Oct 2026 17:00:00 GMT</pubDate><description>Contract scope and budget require verification.</description></item>';
  const leads = parseJobFeed('<rss>' +
    item('For Hire: AI Workflow Engineer at 7shifts (Remote - Canada/US Only)', 'buyer-1') +
    item('For Hire: Automation Specialist at ExampleCo', 'buyer-2') +
    item('For Hire: n8n Engineer — available for your projects', 'seller-1') +
    item('For Hire: AI Engineer at ExampleCo — offering my services', 'seller-2') +
    '</rss>', now);
  assert.deepEqual(leads.map(lead => lead.sourceUrl), [
    'https://community.n8n.io/t/post/buyer-1',
    'https://community.n8n.io/t/post/buyer-2'
  ]);
  assert.ok(leads.every(lead => lead.stage === 'discovered' && lead.qualified === false && lead.budget === 'undecided'));
});

test('suppressed leads cannot get a reply draft', () => {
  assert.throws(() => draftReply({ ...base, stage: 'do-not-contact' }), /not available/);
});

test('Operator pilot signup needs no business or budget and cannot activate paid service', () => {
  const lead = normalizeLead({ ...base, business: '', inquiryType: 'operator-pilot', stage: 'project-paid', revenue: 999 }, { inbound: true });
  assert.equal(lead.business, 'Operator pilot');
  assert.equal(lead.inquiryType, 'operator-pilot');
  assert.equal(lead.stage, 'discovered');
  assert.equal(lead.qualified, false);
  assert.equal(lead.revenue, 0);
  assert.equal(lead.budget, 'undecided');
  assert.match(lead.nextAction, /pilot fit/);
  assert.doesNotMatch(draftReply(lead).body, /\$200|diagnostic/);
  assert.throws(() => normalizeLead({ ...base, inquiryType: 'operator-pilot', consent: false }, { inbound: true }), /agree/);
});
test('Operator interests remain private and separate from matching automation inquiries', async () => {
  const store = openFunnelStore(':memory:');
  const automation = normalizeLead({ ...base, business: 'Operator pilot' }, { inbound: true });
  const pilot = normalizeLead({ ...base, business: 'Operator pilot', inquiryType: 'operator-pilot' }, { inbound: true });
  store.insert(automation);
  const saved = store.insert(pilot);
  assert.equal(saved.duplicate, false);
  assert.equal(store.insert(pilot).duplicate, true);
  const handler = createFunnelHandler({ store });
  const res = response();
  await handler({ method: 'POST', body: { lead: { ...base, inquiryType: 'operator-pilot' } }, headers: {}, socket: { remoteAddress: '127.0.0.1' } }, res);
  assert.equal(res.code, 201);
  assert.deepEqual(Object.keys(res.data).sort(), ['ok', 'receipt']);
  assert.equal(store.list().find(item => item.id === res.data.receipt).inquiryType, 'operator-pilot');
  store.close();
});

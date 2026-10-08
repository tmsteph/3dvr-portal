import test from 'node:test';
import assert from 'node:assert/strict';
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
test('suppressed leads cannot get a reply draft', () => {
  assert.throws(() => draftReply({ ...base, stage: 'do-not-contact' }), /not available/);
});

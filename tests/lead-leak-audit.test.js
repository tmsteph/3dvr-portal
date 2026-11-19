import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAuditRequest, auditNotification, notifyEmail } from '../src/lead-leak-audit/model.js';
import { openAuditStore } from '../src/lead-leak-audit/store.js';
import { createLeadLeakAuditHandler } from '../src/lead-leak-audit/handler.js';

const base = {
  business: 'Rivera Roofing LLC',
  name: 'Alex Rivera',
  email: 'Alex@RiveraRoofing.com',
  website: 'riveraroofing.com',
  phone: '(555) 013-4477',
  businessType: 'Contractor / trades',
  note: 'Our contact form might be broken.',
  leaks: ['Calls after 5 PM go to voicemail'],
  leadsPerMonth: '40',
  valuePerJob: '8,000'
};
const response = () => ({ setHeader() {}, status(n) { this.code = n; return this; }, json(data) { this.data = data; return this; } });
const post = (handler, body, headers = {}) => {
  const res = response();
  return handler({ method: 'POST', body, headers, socket: { remoteAddress: '127.0.0.1' } }, res).then(() => res);
};

test('normalization requires a reply email and strips spoofed fields', () => {
  const request = normalizeAuditRequest({ ...base, stage: 'paid', notified: true });
  assert.equal(request.email, 'alex@riveraroofing.com');
  assert.equal(request.stage, undefined);
  assert.equal(request.notified, undefined);
  assert.throws(() => normalizeAuditRequest({ ...base, email: '' }), /Complete the required fields/);
  assert.throws(() => normalizeAuditRequest({ ...base, email: 'not-an-email' }), /valid email/);
  assert.throws(() => normalizeAuditRequest({ ...base, phone: ' ' }), /Complete the required fields/);
});

test('notification is addressed to Thomas and carries the request', () => {
  assert.equal(notifyEmail({}), '3dvrtech@gmail.com');
  const note = auditNotification(normalizeAuditRequest(base));
  assert.match(note.subject, /Rivera Roofing LLC/);
  assert.match(note.body, /alex@riveraroofing\.com/);
  assert.match(note.body, /\(555\) 013-4477/);
});

test('store deduplicates by email, business and phone', () => {
  const store = openAuditStore(':memory:');
  const request = normalizeAuditRequest(base);
  const saved = store.insert(request);
  assert.equal(saved.duplicate, false);
  assert.equal(saved.request.notified, false);
  assert.equal(store.insert(request).duplicate, true);
  assert.equal(store.list().length, 1);
  store.markNotified(saved.request.id);
  assert.equal(store.get(saved.request.id).notified, true);
  store.close();
});

test('public submission stores the record and sends the notification', async () => {
  const store = openAuditStore(':memory:');
  const sent = [];
  const mailTransport = { sendMail: async message => { sent.push(message); return { messageId: 'test' }; } };
  const handler = createLeadLeakAuditHandler({ store, config: { PORTAL_ORIGIN: 'https://portal.3dvr.tech', GMAIL_USER: '3dvrtech@gmail.com' }, mailTransport });
  const res = await post(handler, { request: base }, { origin: 'https://portal.3dvr.tech' });
  assert.equal(res.code, 201);
  assert.equal(res.data.ok, true);
  assert.equal(res.data.notified, true);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, '3dvrtech@gmail.com');
  assert.equal(sent[0].replyTo, 'alex@riveraroofing.com');
  const stored = store.get(res.data.receipt);
  assert.equal(stored.business, 'Rivera Roofing LLC');
  assert.equal(stored.notified, true);
  store.close();
});

test('honeypot, bad origin and missing email are rejected and store nothing', async () => {
  const store = openAuditStore(':memory:');
  const handler = createLeadLeakAuditHandler({ store, config: { PORTAL_ORIGIN: 'https://portal.3dvr.tech' }, mailTransport: null });
  let res = await post(handler, { request: { ...base, websiteTrap: 'spammy' } });
  assert.equal(res.code, 400);
  res = await post(handler, { request: base }, { origin: 'https://evil.example' });
  assert.equal(res.code, 403);
  res = await post(handler, { request: { ...base, email: '' } });
  assert.equal(res.code, 400);
  assert.equal(store.list().length, 0);
  store.close();
});

test('submission still lands when email is unconfigured or fails', async () => {
  const store = openAuditStore(':memory:');
  const noMail = createLeadLeakAuditHandler({ store, config: {}, mailTransport: null });
  let res = await post(noMail, { request: base });
  assert.equal(res.code, 201);
  assert.equal(res.data.notified, false);
  const failing = createLeadLeakAuditHandler({ store, config: {}, mailTransport: { sendMail: async () => { throw new Error('smtp down'); } } });
  res = await post(failing, { request: { ...base, email: 'second@example.com' } });
  assert.equal(res.code, 201);
  assert.equal(res.data.notified, false);
  assert.equal(store.list().length, 2);
  store.close();
});

const test = require('node:test');
const assert = require('node:assert/strict');
const { ensureState, topicFromRequest, slugify, resolveRequestEmail, junkReason, requestFingerprint } = require('../thomas-agent/node/free-site-worker');

const FORM_BOILERPLATE = [
  'I want a free live one-page website on a 3DVR-hosted address.',
].join('\n');

function formRequest({ name, email, description }) {
  return {
    from: email,
    subject: `Free 3DVR website request — ${name}`,
    body: [
      FORM_BOILERPLATE,
      `Name/business: ${name}`,
      `Best email for the live link: ${email}`,
      'What the website should explain:',
      description,
      'Please build the smallest useful version and email me the live URL.',
    ].join('\n'),
  };
}

test('standard free-site subject resolves to requested name', () => {
  assert.equal(topicFromRequest('Free 3DVR website request — Test', 'Please build it.'), 'Test');
  assert.equal(slugify(topicFromRequest('Free 3DVR website request — Test', 'Please build it.')), 'test');
});

test('duplicated MIME body does not duplicate the topic slug', () => {
  const topic = topicFromRequest('Make me a website', 'A website about cats A website about cats');
  assert.equal(topic, 'cats');
  assert.equal(slugify(topic), 'cats');
});

test('natural language topic remains supported', () => {
  const topic = topicFromRequest('Website', "I'd like a free website please about potatoes.");
  assert.equal(topic, 'potatoes');
});

test('junk filter catches the 2026-11-10 triple-submitted junk request', () => {
  const request = formRequest({
    name: 'UXFtRUNFKiwQFhlXlaqqItd',
    email: '1.3o.ffi.ci.al..je.et@gmail.com',
    description: '1.3o.ffi.ci.al..je.et@gmail.com',
  });
  assert.equal(junkReason(request), 'random-name-and-empty-description');
});

test('junk filter catches the 2026-11-08 junk request', () => {
  const request = formRequest({
    name: 'hDkrjZOHNWokzwjxJszuC',
    email: 'pe.w.us.ida.sik.3.3.7@gmail.com',
    description: 'pe.w.us.ida.sik.3.3.7@gmail.com',
  });
  assert.equal(junkReason(request), 'random-name-and-empty-description');
});

test('junk filter leaves a genuine business request alone', () => {
  const request = formRequest({
    name: 'Cruisers Garage',
    email: 'jonny@example.com',
    description: 'Motorcycle rentals and sales in Old Town San Diego, open weekends.',
  });
  assert.equal(junkReason(request), '');
});

test('junk filter leaves a long-named business with a real description alone', () => {
  const request = formRequest({
    name: 'AbcdefghijKlmnopqrStuv',
    email: 'owner@example.com',
    description: 'We repair vintage radios and sell restored sets at the swap meet.',
  });
  assert.equal(junkReason(request), '');
});

test('request fingerprint matches identical resubmissions but not corrections', () => {
  const first = formRequest({ name: 'Cruisers Garage', email: 'jonny@example.com', description: 'Rentals and sales.' });
  const again = formRequest({ name: 'Cruisers Garage', email: 'jonny@example.com', description: 'Rentals and sales.' });
  const corrected = formRequest({ name: 'Cruisers Garage', email: 'jonny@example.com', description: 'Rentals, sales, and repairs.' });
  assert.equal(requestFingerprint(first), requestFingerprint(again));
  assert.notEqual(requestFingerprint(first), requestFingerprint(corrected));
});

test('free-site request email trusts Reply-To only for the configured mailbox', () => {
  const mailbox = '3dvr.tech@gmail.com';
  assert.equal(resolveRequestEmail({
    from: [{ address: mailbox }],
    replyTo: [{ address: 'customer@example.com' }],
  }, mailbox), 'customer@example.com');

  assert.equal(resolveRequestEmail({
    from: [{ address: 'outside@example.com' }],
    replyTo: [{ address: 'spoofed@example.com' }],
  }, mailbox), 'outside@example.com');

  assert.equal(resolveRequestEmail({
    from: [{ address: mailbox }],
    replyTo: [],
  }, mailbox), '');
});

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('fulfillment state initializes once and preserves completed requests', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'free-site-state-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const stateFile = path.join(dir, 'state.json');
  const initial = ensureState(stateFile);
  assert.equal(initial.version, 1);
  initial.messages['fake-request'] = { status: 'processed' };
  fs.writeFileSync(stateFile, JSON.stringify(initial));
  assert.deepEqual(ensureState(stateFile), initial);
});

test('corrupt or incomplete fulfillment state fails closed without replacing history', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'free-site-state-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const stateFile = path.join(dir, 'state.json');
  for (const content of ['{truncated', '{}', '{"version":1,"bootstrapAt":"2026-11-23T00:00:00Z","messages":[]}']) {
    fs.writeFileSync(stateFile, content);
    assert.throws(() => ensureState(stateFile));
    assert.equal(fs.readFileSync(stateFile, 'utf8'), content);
  }
});

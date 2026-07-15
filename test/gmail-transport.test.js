const test = require('node:test');
const assert = require('node:assert/strict');
const { buildGmailTransportOptions } = require('../thomas-agent/node/gmail-transport');

test('gmail transport defaults to smtp.gmail.com on port 587 with STARTTLS', () => {
  const options = buildGmailTransportOptions({
    GMAIL_USER: 'bot@example.com',
    GMAIL_APP_PASSWORD: 'secret',
  });

  assert.equal(options.host, 'smtp.gmail.com');
  assert.equal(options.port, 587);
  assert.equal(options.secure, false);
  assert.equal(options.requireTLS, true);
  assert.deepEqual(options.tls, { rejectUnauthorized: true });
  assert.deepEqual(options.auth, { user: 'bot@example.com', pass: 'secret' });
});

test('gmail transport can be forced to legacy SSL mode', () => {
  const options = buildGmailTransportOptions({
    GMAIL_USER: 'bot@example.com',
    GMAIL_APP_PASSWORD: 'secret',
    THREEDVR_GMAIL_SMTP_PORT: '465',
    THREEDVR_GMAIL_SMTP_SECURE: 'true',
  });

  assert.equal(options.port, 465);
  assert.equal(options.secure, true);
  assert.equal(options.requireTLS, undefined);
  assert.equal(options.tls, undefined);
});

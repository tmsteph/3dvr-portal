import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildGmailTransportOptions } from '../api/_lib/gmail-transport.js';

describe('gmail transport', () => {
  it('defaults to Gmail SMTP 587 with STARTTLS', () => {
    const options = buildGmailTransportOptions({
      GMAIL_USER: 'bot@example.com',
      GMAIL_APP_PASSWORD: 'secret'
    });

    assert.equal(options.host, 'smtp.gmail.com');
    assert.equal(options.port, 587);
    assert.equal(options.secure, false);
    assert.equal(options.requireTLS, true);
    assert.deepEqual(options.tls, { rejectUnauthorized: true });
  });

  it('can be forced to legacy SSL mode', () => {
    const options = buildGmailTransportOptions({
      GMAIL_USER: 'bot@example.com',
      GMAIL_APP_PASSWORD: 'secret',
      THREEDVR_GMAIL_SMTP_PORT: '465',
      THREEDVR_GMAIL_SMTP_SECURE: 'true'
    });

    assert.equal(options.port, 465);
    assert.equal(options.secure, true);
    assert.equal(options.requireTLS, undefined);
    assert.equal(options.tls, undefined);
  });
});

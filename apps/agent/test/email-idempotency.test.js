const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  acquireEmailSend,
  fingerprintEmail,
  markEmailSent,
  markEmailUncertain,
} = require('../thomas-agent/node/email-idempotency');

function tempConfig() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), '3dvr-email-idempotency-'));
  return {
    dir,
    config: {
      THREEDVR_EMAIL_IDEMPOTENCY_DIR: dir,
      THREEDVR_EMAIL_IDEMPOTENCY_SENT_TTL_MS: String(7 * 24 * 60 * 60 * 1000),
      THREEDVR_EMAIL_IDEMPOTENCY_UNCERTAIN_TTL_MS: String(30 * 60 * 1000),
    },
  };
}

const message = {
  from: '3dvr.tech@gmail.com',
  to: 'hello@example.com',
  subject: 'Hello',
  text: 'A useful note.\nThanks!',
};

test('fingerprint is stable across email casing and CRLF line endings', () => {
  assert.equal(
    fingerprintEmail(message),
    fingerprintEmail({ ...message, from: '3DVR.TECH@GMAIL.COM', to: 'HELLO@EXAMPLE.COM', text: 'A useful note.\r\nThanks!' })
  );
});

test('blocks a concurrent identical send while the first is inflight', () => {
  const { dir, config } = tempConfig();
  try {
    const first = acquireEmailSend(message, { config });
    const second = acquireEmailSend(message, { config });
    assert.equal(first.ok, true);
    assert.equal(second.ok, false);
    assert.match(second.reason, /in progress|uncertain/i);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('blocks an identical email after a confirmed send', () => {
  const { dir, config } = tempConfig();
  try {
    const first = acquireEmailSend(message, { config });
    markEmailSent(first, { transport: 'portal' });
    const second = acquireEmailSend(message, { config });
    assert.equal(second.ok, false);
    assert.match(second.reason, /already sent/i);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('an ambiguous send failure blocks automatic retry', () => {
  const { dir, config } = tempConfig();
  try {
    const first = acquireEmailSend(message, { config });
    markEmailUncertain(first, new Error('connection reset after DATA'));
    const second = acquireEmailSend(message, { config });
    assert.equal(second.ok, false);
    assert.equal(second.record.status, 'uncertain');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a stale inflight lock can be recovered after the safety window', () => {
  const { dir, config } = tempConfig();
  config.THREEDVR_EMAIL_IDEMPOTENCY_UNCERTAIN_TTL_MS = '1';
  const now = Date.now();
  try {
    const first = acquireEmailSend(message, { config, now });
    const second = acquireEmailSend(message, { config, now: now + 5 });
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import suppression from '../src/outreach/suppression.cjs';
import { createUnifiedEmailHandler } from '../api/calendar/reminder-email.js';

const {
  recipientDecision,
  recordRecipientCheck,
  recordSuppression,
} = suppression;

async function withDb(fn) {
  const dir = await mkdtemp(path.join(os.tmpdir(), '3dvr-suppression-'));
  const config = {
    THREEDVR_OUTREACH_SUPPRESSION_DB: path.join(dir, 'suppression.sqlite'),
    THREEDVR_OUTREACH_REQUIRE_PERSONAL_SENT_CHECK: 'true',
    THREEDVR_PERSONAL_SENT_CHECK_MAX_AGE_HOURS: '24',
    THREEDVR_OUTREACH_BOOTSTRAP_LEGACY_LOG: 'false',
  };
  try { await fn(config); } finally { await rm(dir, { recursive: true, force: true }); }
}

function mockRes() {
  return {
    statusCode: 200,
    body: undefined,
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    end() { return this; },
  };
}
test('recipient requires a fresh personal Sent-history clearance', async () => {
  await withDb(async (config) => {
    const email = 'fresh@example.com';
    assert.equal(recipientDecision(email, { config }).code, 'personal_sent_check_required');
    recordRecipientCheck(email, { config, status: 'clear', now: '2026-09-11T06:00:00.000Z' });
    assert.equal(recipientDecision(email, { config, now: '2026-09-11T07:00:00.000Z' }).allowed, true);
    assert.equal(recipientDecision(email, { config, now: '2026-09-12T07:00:01.000Z' }).code, 'personal_sent_check_stale');
  });
});

test('prior personal Gmail contact suppresses recipient regardless of future message copy', async () => {
  await withDb(async (config) => {
    const email = 'contacted@example.com';
    recordRecipientCheck(email, {
      config,
      status: 'contacted',
      source: 'tmsteph-gmail-sent',
      evidence: 'sent-history-match',
    });
    const decision = recipientDecision(email, { config });
    assert.equal(decision.allowed, false);
    assert.equal(decision.code, 'recipient_suppressed');
    assert.equal(decision.suppression.source, 'tmsteph-gmail-sent');
  });
});



test('business-domain history suppresses other cold routes at the same company', async () => {
  await withDb(async (config) => {
    recordRecipientCheck('hello@company.example', {
      config,
      status: 'contacted',
      source: 'tmsteph-gmail-sent',
      evidence: 'sent-history-match',
    });
    const decision = recipientDecision('sales@company.example', {
      config,
      requirePersonalCheck: false,
    });
    assert.equal(decision.allowed, false);
    assert.equal(decision.code, 'recipient_suppressed');
    assert.equal(decision.suppression.scope, 'domain');
  });
});



test('suppression database self-heals from the legacy outreach log', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), '3dvr-suppression-log-'));
  const logFile = path.join(dir, 'outreach-log.ndjson');
  const config = {
    THREEDVR_OUTREACH_SUPPRESSION_DB: path.join(dir, 'suppression.sqlite'),
    THREEDVR_OUTREACH_LOG_FILE: logFile,
    THREEDVR_OUTREACH_REQUIRE_PERSONAL_SENT_CHECK: 'false',
    THREEDVR_OUTREACH_BOOTSTRAP_LEGACY_LOG: 'true',
  };
  await writeFile(logFile, `${JSON.stringify({
    status: 'sent', contact: 'hello@legacy.example', timestamp: '2026-09-10T12:00:00Z', subject: 'Prior note',
  })}\n`);
  try {
    const decision = recipientDecision('sales@legacy.example', { config });
    assert.equal(decision.allowed, false);
    assert.equal(decision.code, 'recipient_suppressed');
    assert.equal(decision.suppression.source, 'legacy-outreach-log');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('live lead-outreach handler blocks a second cold email to the same recipient', async () => {
  await withDb(async (base) => {
    const email = 'prospect@example.com';
    const config = {
      ...base,
      THREEDVR_OUTREACH_SUPPRESSION_ENFORCED: 'true',
      GMAIL_USER: '3dvr.tech@gmail.com',
      GMAIL_APP_PASSWORD: 'placeholder',
      AGENT_OPERATOR_EMAIL_TOKEN: 'operator-secret',
    };
    recordRecipientCheck(email, { config, status: 'clear' });
    let sends = 0;
    const handler = createUnifiedEmailHandler({
      config,
      mailTransport: { sendMail: async () => { sends += 1; return { ok: true }; } },
    });
    const first = mockRes();
    await handler({
      method: 'POST',
      headers: { authorization: 'Bearer operator-secret' },
      body: { mode: 'lead-outreach', to: [email], subject: 'First subject', text: 'First cold message.' },
    }, first);
    assert.equal(first.statusCode, 200);
    assert.equal(sends, 1);

    const second = mockRes();
    await handler({
      method: 'POST',
      headers: { authorization: 'Bearer operator-secret' },
      body: { mode: 'lead-outreach', to: [email], subject: 'Different subject', text: 'Different cold message.' },
    }, second);
    assert.equal(second.statusCode, 409);
    assert.equal(second.body.code, 'recipient_suppressed');
    assert.equal(sends, 1);
  });
});

test('threaded replies bypass cold-outreach suppression', async () => {
  await withDb(async (base) => {
    const email = 'thread@example.com';
    const config = {
      ...base,
      THREEDVR_OUTREACH_SUPPRESSION_ENFORCED: 'true',
      GMAIL_USER: '3dvr.tech@gmail.com',
      GMAIL_APP_PASSWORD: 'placeholder',
      AGENT_OPERATOR_EMAIL_TOKEN: 'operator-secret',
    };
    recordSuppression(email, { config, source: 'tmsteph-gmail-sent', reason: 'Previously contacted.' });
    let sends = 0;
    const handler = createUnifiedEmailHandler({
      config,
      mailTransport: { sendMail: async () => { sends += 1; return { ok: true }; } },
    });
    const res = mockRes();
    await handler({
      method: 'POST',
      headers: { authorization: 'Bearer operator-secret' },
      body: {
        mode: 'lead-outreach', to: [email], subject: 'Re: existing thread', text: 'Continuing our thread.',
        inReplyTo: '<prior@example.com>', references: '<prior@example.com>',
      },
    }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(sends, 1);
  });
});

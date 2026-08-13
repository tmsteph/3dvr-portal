const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createProspect, openLedger, transitionProspect } = require('../thomas-agent/node/revenue-ledger');
const { projectInboxMessage } = require('../thomas-agent/node/revenue-inbox-projection');

test('inbox message-id projection is replay-safe for replies and bounces', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), '3dvr-inbox-ledger-'));
  const db = openLedger({ filePath: path.join(tmp, 'ledger.sqlite') });
  try {
    const replied = createProspect(db, { name: 'Reply', contact: 'reply@test.example' }).prospect;
    transitionProspect(db, { prospectId: replied.id, toState: 'verified', idempotencyKey: 'rv' });
    transitionProspect(db, { prospectId: replied.id, toState: 'eligible', idempotencyKey: 're' });
    transitionProspect(db, { prospectId: replied.id, toState: 'sent', idempotencyKey: 'rs' });
    const first = projectInboxMessage(db, { fromEmail: 'reply@test.example', messageId: 'reply-1', subject: 'Re: question' });
    assert.equal(first.prospect.state, 'replied');
    assert.equal(projectInboxMessage(db, { fromEmail: 'reply@test.example', messageId: 'reply-1', subject: 'Re: question' }).replayed, true);

    const bounced = createProspect(db, { name: 'Bounce', contact: 'bounce@test.example' }).prospect;
    transitionProspect(db, { prospectId: bounced.id, toState: 'verified', idempotencyKey: 'bv' });
    transitionProspect(db, { prospectId: bounced.id, toState: 'eligible', idempotencyKey: 'be' });
    transitionProspect(db, { prospectId: bounced.id, toState: 'sent', idempotencyKey: 'bs' });
    const bounce = projectInboxMessage(db, { prospectEmail: 'bounce@test.example', messageId: 'bounce-1', from: 'mailer-daemon', subject: 'Delivery Status Notification (Failure)' });
    assert.equal(bounce.prospect.state, 'bounced');
  } finally { db.close(); fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('inbox projection bridges legacy mailto contact identities', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), '3dvr-inbox-mailto-'));
  const db = openLedger({ filePath: path.join(tmp, 'ledger.sqlite') });
  try {
    const prospect = createProspect(db, { name: 'Legacy', contact: 'mailto:legacy@test.example' }).prospect;
    transitionProspect(db, { prospectId: prospect.id, toState: 'verified', idempotencyKey: 'lv' });
    transitionProspect(db, { prospectId: prospect.id, toState: 'eligible', idempotencyKey: 'le' });
    transitionProspect(db, { prospectId: prospect.id, toState: 'sent', idempotencyKey: 'ls' });
    const result = projectInboxMessage(db, { prospectEmail: 'legacy@test.example', messageId: 'legacy-bounce', subject: 'Delivery failure' });
    assert.equal(result.prospect.state, 'bounced');
  } finally { db.close(); fs.rmSync(tmp, { recursive: true, force: true }); }
});

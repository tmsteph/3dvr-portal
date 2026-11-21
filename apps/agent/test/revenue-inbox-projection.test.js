const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createProspect, finishDeliveryAttempt, openLedger, reserveDeliveryAttempt, transitionProspect } = require('../thomas-agent/node/revenue-ledger');
const { projectInboxMessage } = require('../thomas-agent/node/revenue-inbox-projection');
const { consumeInboxState } = require('../thomas-agent/node/revenue-inbox-consumer');

test('inbox message-id projection is replay-safe for replies and bounces', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), '3dvr-inbox-ledger-'));
  const db = openLedger({ filePath: path.join(tmp, 'ledger.sqlite') });
  try {
    const replied = createProspect(db, { name: 'Reply', contact: 'reply@test.example' }).prospect;
    transitionProspect(db, { prospectId: replied.id, toState: 'verified', idempotencyKey: 'rv' });
    transitionProspect(db, { prospectId: replied.id, toState: 'eligible', idempotencyKey: 're' });
    transitionProspect(db, { prospectId: replied.id, toState: 'sent', idempotencyKey: 'rs' });
    reserveDeliveryAttempt(db, { prospectId: replied.id, attemptId: 'reply-outbound' });
    finishDeliveryAttempt(db, { attemptId: 'reply-outbound', status: 'acknowledged',
      messageId: '<sent-1@test.example>', transport: 'synthetic-test' });
    const reply = { fromEmail: 'reply@test.example', messageId: 'reply-1',
      subject: 'Re: question', inReplyTo: '<sent-1@test.example>' };
    const first = projectInboxMessage(db, reply);
    assert.equal(first.prospect.state, 'replied');
    assert.equal(projectInboxMessage(db, reply).replayed, true);

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

test('unlinked inbox messages cannot claim a customer replied to outreach', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), '3dvr-inbox-unlinked-'));
  const db = openLedger({ filePath: path.join(tmp, 'ledger.sqlite') });
  try {
    const alice = createProspect(db, { name: 'Alice', contact: 'alice@test.example' }).prospect;
    const bob = createProspect(db, { name: 'Bob', contact: 'bob@test.example' }).prospect;
    for (const [prospect, prefix] of [[alice, 'alice'], [bob, 'bob']]) {
      transitionProspect(db, { prospectId: prospect.id, toState: 'verified', idempotencyKey: prefix + ':v' });
      transitionProspect(db, { prospectId: prospect.id, toState: 'eligible', idempotencyKey: prefix + ':e' });
      transitionProspect(db, { prospectId: prospect.id, toState: 'sent', idempotencyKey: prefix + ':s' });
      reserveDeliveryAttempt(db, { prospectId: prospect.id, attemptId: prefix + ':outbound' });
      finishDeliveryAttempt(db, { attemptId: prefix + ':outbound', status: 'acknowledged',
        messageId: '<outbound-' + prefix + '@test.example>', transport: 'synthetic-test' });
    }
    const cases = [
      { fromEmail: 'alice@test.example', subject: 'Unrelated message' },
      { fromEmail: 'alice@test.example', inReplyTo: '<outbound-bob@test.example>' },
      { fromEmail: 'alice@test.example', references: '<outbound-alice@test.example.evil>' },
      { fromEmail: 'attacker@test.example', prospectEmail: 'alice@test.example',
        inReplyTo: '<outbound-alice@test.example>' },
    ];
    for (const [i, input] of cases.entries()) {
      const result = projectInboxMessage(db, { ...input, messageId: 'unlinked-' + i });
      assert.equal(result.matched, false, 'unlinked contact or thread must not count as a reply');
      assert.match(result.reason, /manual review/);
      assert.equal(db.prepare('SELECT state FROM prospects WHERE id=?').get(alice.id).state, 'sent');
    }
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM revenue_events WHERE type='inbox_replied'").get().n, 0);
    const linked = projectInboxMessage(db, {
      fromEmail: 'alice@test.example', messageId: 'linked-1',
      references: '<earlier@test.example> <outbound-alice@test.example>',
      subject: 'Re: Synthetic project'
    });
    assert.equal(linked.matched, true);
    assert.equal(linked.prospect.state, 'replied');
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM revenue_events WHERE type='inbox_replied'").get().n, 1);
  } finally {
    db.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});


test('one multi-recipient delivery failure preserves independent CRM events and replay', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), '3dvr-inbox-multi-recipient-'));
  const db = openLedger({ filePath: path.join(tmp, 'ledger.sqlite') });
  try {
    for (const [index, email] of ['first@test.example', 'second@test.example'].entries()) {
      const prospect = createProspect(db, { name: 'Synthetic ' + index, contact: email }).prospect;
      transitionProspect(db, { prospectId: prospect.id, toState: 'verified', idempotencyKey: email + ':verified' });
      transitionProspect(db, { prospectId: prospect.id, toState: 'eligible', idempotencyKey: email + ':eligible' });
      transitionProspect(db, { prospectId: prospect.id, toState: 'sent', idempotencyKey: email + ':sent' });
    }
    const inbox = path.join(tmp, 'inbox-state.json');
    fs.writeFileSync(inbox, JSON.stringify({ messages: {
      '<dsn-1@test.example>': {
        from: 'Mail Delivery Subsystem <mailer-daemon@test.example>',
        fromEmail: 'mailer-daemon@test.example',
        subject: 'Delivery Status Notification (Failure)',
        bounceEmails: ['first@test.example', 'second@test.example']
      }
    } }));
    const first = consumeInboxState(db, inbox);
    assert.deepEqual(first, { scanned: 2, matched: 2, unmatched: 0, errors: [] });
    for (const email of ['first@test.example', 'second@test.example']) {
      assert.equal(db.prepare('SELECT state FROM prospects WHERE contact_key=?')
        .get('contact:' + email).state, 'bounced');
    }
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM revenue_events WHERE type='inbox_bounced'").get().n, 2);
    const replay = consumeInboxState(db, inbox);
    assert.deepEqual(replay, { scanned: 2, matched: 2, unmatched: 0, errors: [] });
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM revenue_events WHERE type='inbox_bounced'").get().n, 2,
      'replaying a shared DSN cannot create duplicate transitions');
  } finally {
    db.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

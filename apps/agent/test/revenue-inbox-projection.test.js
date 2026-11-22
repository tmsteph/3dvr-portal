const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createProspect, finishDeliveryAttempt, openLedger, reserveDeliveryAttempt, transitionProspect } = require('../thomas-agent/node/revenue-ledger');
const { projectInboxMessage } = require('../thomas-agent/node/revenue-inbox-projection');
const { consumeInboxState } = require('../thomas-agent/node/revenue-inbox-consumer');

test('sender STOP address does not suppress a linked reply without opt-out intent', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), '3dvr-inbox-sender-name-'));
  const db = openLedger({ filePath: path.join(tmp, 'ledger.sqlite') });
  try {
    const buyer = createProspect(db, { name: 'Synthetic Stop Label', contact: 'stop@buyer.example.test' }).prospect;
    transitionProspect(db, { prospectId: buyer.id, toState: 'verified', idempotencyKey: 'stop-label:v' });
    transitionProspect(db, { prospectId: buyer.id, toState: 'eligible', idempotencyKey: 'stop-label:e' });
    transitionProspect(db, { prospectId: buyer.id, toState: 'sent', idempotencyKey: 'stop-label:s' });
    reserveDeliveryAttempt(db, { prospectId: buyer.id, attemptId: 'stop-label:delivery' });
    finishDeliveryAttempt(db, { attemptId: 'stop-label:delivery', status: 'acknowledged',
      messageId: '<outbound-stop-label@buyer.example.test>', transport: 'synthetic-test' });
    const reply = projectInboxMessage(db, {
      from: 'Stop <stop@buyer.example.test>', fromEmail: 'stop@buyer.example.test',
      messageId: 'stop-label:reply', subject: 'Re: Project scope',
      preview: 'Could you explain the next steps?', inReplyTo: '<outbound-stop-label@buyer.example.test>'
    });
    assert.equal(reply.matched, true);
    assert.equal(reply.prospect.state, 'replied', 'sender name alone must not suppress a linked reply');
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM revenue_events WHERE type='inbox_suppressed'").get().n, 0);
    const optOut = projectInboxMessage(db, {
      from: 'Stop <stop@buyer.example.test>', fromEmail: 'stop@buyer.example.test',
      messageId: 'stop-label:optout', preview: 'Please unsubscribe me.'
    });
    assert.equal(optOut.prospect.state, 'suppressed', 'explicit opt-out remains immediate');
  } finally {
    db.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

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
    reserveDeliveryAttempt(db, { prospectId: bounced.id, attemptId: 'bounce-outbound' });
    finishDeliveryAttempt(db, { attemptId: 'bounce-outbound', status: 'acknowledged',
      messageId: '<sent-bounce@test.example>', transport: 'synthetic-test' });
    const bounce = projectInboxMessage(db, { prospectEmail: 'bounce@test.example', messageId: 'bounce-1', from: 'mailer-daemon', subject: 'Delivery Status Notification (Failure)', originalMessageId: '<sent-bounce@test.example>' });
    assert.equal(bounce.prospect.state, 'bounced');
  } finally { db.close(); fs.rmSync(tmp, { recursive: true, force: true }); }
});


test('unattributed opt-out cannot suppress another buyer, but a matching sender can', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), '3dvr-inbox-optout-'));
  const db = openLedger({ filePath: path.join(tmp, 'ledger.sqlite') });
  try {
    const buyer = createProspect(db, { name: 'Buyer', contact: 'buyer@test.example' }).prospect;
    transitionProspect(db, { prospectId: buyer.id, toState: 'verified', idempotencyKey: 'optout:v' });
    transitionProspect(db, { prospectId: buyer.id, toState: 'eligible', idempotencyKey: 'optout:e' });
    transitionProspect(db, { prospectId: buyer.id, toState: 'sent', idempotencyKey: 'optout:s' });

    for (const fromEmail of ['attacker@test.example', '']) {
      const result = projectInboxMessage(db, {
        prospectEmail: 'buyer@test.example', fromEmail,
        messageId: `fake-stop-${fromEmail || 'unknown'}`, subject: 'Unsubscribe'
      });
      assert.equal(result.matched, false);
      assert.match(result.reason, /manual review/);
      assert.equal(getState(), 'sent', 'a nonmatching or missing sender cannot change buyer state');
    }
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM revenue_events WHERE type='inbox_suppressed'").get().n, 0);

    const real = { prospectEmail: 'buyer@test.example', fromEmail: 'buyer@test.example',
      messageId: 'real-stop', preview: 'Please stop contacting me' };
    const first = projectInboxMessage(db, real);
    assert.equal(first.matched, true);
    assert.equal(first.prospect.state, 'suppressed');
    assert.equal(projectInboxMessage(db, real).replayed, true);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM revenue_events WHERE type='inbox_suppressed'").get().n, 1);
    function getState() {
      return db.prepare('SELECT state FROM prospects WHERE id=?').get(buyer.id).state;
    }
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
    reserveDeliveryAttempt(db, { prospectId: prospect.id, attemptId: 'legacy-outbound' });
    finishDeliveryAttempt(db, { attemptId: 'legacy-outbound', status: 'acknowledged',
      messageId: '<sent-legacy@test.example>', transport: 'synthetic-test' });
    const result = projectInboxMessage(db, { prospectEmail: 'legacy@test.example',
      messageId: 'legacy-bounce', fromEmail: 'postmaster@test.example', subject: 'Delivery failure', originalMessageId: '<sent-legacy@test.example>' });
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
      reserveDeliveryAttempt(db, { prospectId: prospect.id, attemptId: email + ':outbound' });
      finishDeliveryAttempt(db, { attemptId: email + ':outbound', status: 'acknowledged',
        messageId: '<sent-' + index + '@test.example>', transport: 'synthetic-test' });
    }
    const inbox = path.join(tmp, 'inbox-state.json');
    fs.writeFileSync(inbox, JSON.stringify({ messages: {
      '<dsn-1@test.example>': {
        from: 'Mail Delivery Subsystem <mailer-daemon@test.example>',
        fromEmail: 'mailer-daemon@test.example',
        subject: 'Delivery Status Notification (Failure)',
        bounceEmails: ['first@test.example', 'second@test.example'],
        originalMessageIds: ['<sent-0@test.example>', '<sent-1@test.example>']
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

test('unattributed delivery-failure hints cannot bounce a buyer without a provider outbound receipt', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), '3dvr-inbox-bounce-guard-'));
  const db = openLedger({ filePath: path.join(tmp, 'ledger.sqlite') });
  try {
    const buyer = createProspect(db, { name: 'Buyer', contact: 'buyer@test.example' }).prospect;
    transitionProspect(db, { prospectId: buyer.id, toState: 'verified', idempotencyKey: 'bg:v' });
    transitionProspect(db, { prospectId: buyer.id, toState: 'eligible', idempotencyKey: 'bg:e' });
    transitionProspect(db, { prospectId: buyer.id, toState: 'sent', idempotencyKey: 'bg:s' });
    const base = { prospectEmail: 'buyer@test.example', subject: 'Delivery failure' };
    const checkRejected = (message) => {
      const result = projectInboxMessage(db, { ...base, ...message });
      assert.equal(result.matched, false);
      assert.match(result.reason, /manual review/);
      assert.equal(db.prepare('SELECT state FROM prospects WHERE id=?').get(buyer.id).state, 'sent');
    };
    checkRejected({ messageId: 'dsn-without-outbound', fromEmail: 'mailer-daemon@test.example' });

    reserveDeliveryAttempt(db, { prospectId: buyer.id, attemptId: 'bg:outbound' });
    finishDeliveryAttempt(db, { attemptId: 'bg:outbound', status: 'acknowledged',
      messageId: '<sent-buyer@test.example>', transport: 'synthetic-test' });
    checkRejected({ messageId: 'stranger-failure', fromEmail: 'unrelated@test.example' });
    checkRejected({ messageId: 'no-original-id', fromEmail: 'mailer-daemon@test.example' });
    checkRejected({ messageId: 'wrong-original-id', fromEmail: 'mailer-daemon@test.example',
      originalMessageId: '<someone-else@test.example>' });
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM revenue_events WHERE type='inbox_bounced'").get().n, 0);

    const realDsn = { ...base, messageId: 'attributable-dsn',
      from: 'Mail Delivery Subsystem <mailer-daemon@test.example>',
      fromEmail: 'mailer-daemon@test.example',
      originalMessageId: '<sent-buyer@test.example>' };
    const first = projectInboxMessage(db, realDsn);
    assert.equal(first.matched, true);
    assert.equal(first.prospect.state, 'bounced');
    assert.equal(projectInboxMessage(db, realDsn).replayed, true);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM revenue_events WHERE type='inbox_bounced'").get().n, 1);
  } finally { db.close(); fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('delivery failure for a different acknowledged contact cannot bounce this buyer', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), '3dvr-inbox-cross-dsn-'));
  const db = openLedger({ filePath: path.join(tmp, 'ledger.sqlite') });
  try {
    const contacts = ['alice@test.example', 'bob@test.example'];
    for (const email of contacts) {
      const prospect = createProspect(db, { name: email, contact: email }).prospect;
      transitionProspect(db, { prospectId: prospect.id, toState: 'verified',
        idempotencyKey: email + ':verified' });
      transitionProspect(db, { prospectId: prospect.id, toState: 'eligible',
        idempotencyKey: email + ':eligible' });
      transitionProspect(db, { prospectId: prospect.id, toState: 'sent',
        idempotencyKey: email + ':sent' });
      reserveDeliveryAttempt(db, { prospectId: prospect.id, attemptId: email + ':attempt' });
      finishDeliveryAttempt(db, { attemptId: email + ':attempt', status: 'acknowledged',
        messageId: '<sent-' + email + '>', transport: 'synthetic-test' });
    }
    const misleading = projectInboxMessage(db, {
      prospectEmail: 'alice@test.example', fromEmail: 'postmaster@test.example',
      messageId: 'dsn-cross-buyer', subject: 'Delivery Status Notification',
      originalMessageId: '<sent-bob@test.example>'
    });
    assert.equal(misleading.matched, false);
    assert.match(misleading.reason, /manual review/);
    assert.equal(db.prepare('SELECT state FROM prospects WHERE contact=?')
      .get('alice@test.example').state, 'sent');
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM revenue_events WHERE type='inbox_bounced'").get().n, 0);
    const linked = projectInboxMessage(db, {
      prospectEmail: 'alice@test.example', fromEmail: 'postmaster@test.example',
      messageId: 'dsn-correct-buyer', subject: 'Delivery Status Notification',
      originalMessageId: '<sent-alice@test.example>'
    });
    assert.equal(linked.matched, true);
    assert.equal(linked.prospect.state, 'bounced');
  } finally { db.close(); fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('distinct linked replies are recorded as separate CRM touches, while replay is idempotent', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), '3dvr-inbox-repeat-reply-'));
  const db = openLedger({ filePath: path.join(tmp, 'ledger.sqlite') });
  try {
    const buyer = createProspect(db, {
      name: 'Synthetic Repeat Buyer', contact: 'repeat@test.example'
    }).prospect;
    transitionProspect(db, { prospectId: buyer.id, toState: 'verified', idempotencyKey: 'rr:verified' });
    transitionProspect(db, { prospectId: buyer.id, toState: 'eligible', idempotencyKey: 'rr:eligible' });
    transitionProspect(db, { prospectId: buyer.id, toState: 'sent', idempotencyKey: 'rr:sent' });
    reserveDeliveryAttempt(db, { prospectId: buyer.id, attemptId: 'rr:outbound' });
    finishDeliveryAttempt(db, {
      attemptId: 'rr:outbound', status: 'acknowledged',
      messageId: '<rr-outbound@test.example>', transport: 'synthetic-test'
    });
    const base = {
      fromEmail: 'repeat@test.example', subject: 'Re: project question',
      references: '<rr-outbound@test.example>'
    };
    const first = projectInboxMessage(db, { ...base, messageId: 'rr:reply-1' });
    assert.equal(first.replayed, false);
    assert.equal(first.prospect.state, 'replied');

    const secondMessage = { ...base, messageId: 'rr:reply-2', preview: 'A second question' };
    const second = projectInboxMessage(db, secondMessage);
    assert.equal(second.matched, true);
    assert.equal(second.replayed, false, 'new customer message must not be silently discarded');
    assert.equal(second.event.from_state, 'replied');
    assert.equal(second.event.to_state, 'replied');
    assert.equal(second.prospect.state, 'replied');
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM revenue_events WHERE type='inbox_replied'").get().n, 2);
    assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM projection_outbox o
      JOIN revenue_events e ON e.id = o.event_id WHERE e.type='inbox_replied'`).get().n, 2,
      'each genuine reply needs its own pending CRM touch');

    const repeat = projectInboxMessage(db, secondMessage);
    assert.equal(repeat.replayed, true);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM revenue_events WHERE type='inbox_replied'").get().n, 2);
    assert.throws(() => transitionProspect(db, {
      prospectId: buyer.id, toState: 'replied', type: 'state_transition',
      idempotencyKey: 'rr:forged-noop'
    }), /Invalid transition/, 'generic self-transitions must stay forbidden');
  } finally { db.close(); fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('positive delivery receipts and temporary delays never mark a lead bounced', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), '3dvr-inbox-delivery-success-'));
  const db = openLedger({ filePath: path.join(tmp, 'ledger.sqlite') });
  try {
    const buyer = createProspect(db, {
      name: 'Synthetic Receipt Buyer', contact: 'receipt@test.example'
    }).prospect;
    transitionProspect(db, { prospectId: buyer.id, toState: 'verified', idempotencyKey: 'dsn-good:v' });
    transitionProspect(db, { prospectId: buyer.id, toState: 'eligible', idempotencyKey: 'dsn-good:e' });
    transitionProspect(db, { prospectId: buyer.id, toState: 'sent', idempotencyKey: 'dsn-good:s' });
    reserveDeliveryAttempt(db, { prospectId: buyer.id, attemptId: 'dsn-good:outbound' });
    finishDeliveryAttempt(db, {
      attemptId: 'dsn-good:outbound', status: 'acknowledged',
      messageId: '<receipt-out@test.example>', transport: 'synthetic-test'
    });
    const base = {
      prospectEmail: 'receipt@test.example', fromEmail: 'postmaster@test.example',
      originalMessageId: '<receipt-out@test.example>'
    };
    const notices = [
      { subject: 'Delivery Status Notification (Success)' },
      { subject: 'Delivery Status Notification (Delay)' },
      { subject: 'Delivery Status Notification', preview: 'Status: 2.0.0 successfully delivered' },
      { subject: 'Delivery Status Notification', preview: 'Status: 4.2.0 temporarily deferred' },
    ];
    for (const [index, notice] of notices.entries()) {
      const result = projectInboxMessage(db, {
        ...base, ...notice, messageId: 'dsn-nonfailure-' + index
      });
      assert.equal(result.matched, false, 'success or temporary delay cannot mean permanent bounce');
      assert.match(result.reason, /manual review/);
      assert.equal(db.prepare('SELECT state FROM prospects WHERE id=?').get(buyer.id).state, 'sent');
    }
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM revenue_events WHERE type='inbox_bounced'").get().n, 0);
    const actualFailure = projectInboxMessage(db, {
      ...base, messageId: 'dsn-actual-failure',
      subject: 'Delivery Status Notification (Failure)', preview: 'Status: 5.1.1 user unknown'
    });
    assert.equal(actualFailure.matched, true, 'a correlated permanent delivery failure still bounces');
    assert.equal(actualFailure.prospect.state, 'bounced');
  } finally {
    db.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});


test('a request to stop by an event is a linked reply, while standalone STOP still opts out', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), '3dvr-inbox-stop-by-'));
  const db = openLedger({ filePath: path.join(tmp, 'ledger.sqlite') });
  try {
    const buyer = createProspect(db, {
      name: 'Synthetic Venue Owner', contact: 'venue@test.example'
    }).prospect;
    transitionProspect(db, { prospectId: buyer.id, toState: 'verified', idempotencyKey: 'visit:v' });
    transitionProspect(db, { prospectId: buyer.id, toState: 'eligible', idempotencyKey: 'visit:e' });
    transitionProspect(db, { prospectId: buyer.id, toState: 'sent', idempotencyKey: 'visit:s' });
    reserveDeliveryAttempt(db, { prospectId: buyer.id, attemptId: 'visit:outbound' });
    finishDeliveryAttempt(db, {
      attemptId: 'visit:outbound', status: 'acknowledged',
      messageId: '<visit-outbound@test.example>', transport: 'synthetic-test'
    });
    const visit = projectInboxMessage(db, {
      fromEmail: 'venue@test.example', messageId: 'visit:reply',
      inReplyTo: '<visit-outbound@test.example>',
      subject: 'Can you stop by our event?', preview: 'Please stop by Tuesday to discuss our AV setup.'
    });
    assert.equal(visit.matched, true);
    assert.equal(visit.prospect.state, 'replied', 'a visit request is not an opt-out');
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM revenue_events WHERE type='inbox_suppressed'").get().n, 0);
    const optOut = projectInboxMessage(db, {
      fromEmail: 'venue@test.example', messageId: 'visit:stop', subject: 'STOP'
    });
    assert.equal(optOut.prospect.state, 'suppressed', 'standalone STOP must remain effective');
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM revenue_events WHERE type='inbox_suppressed'").get().n, 1);
    assert.equal(projectInboxMessage(db, {
      fromEmail: 'venue@test.example', messageId: 'visit:stop', subject: 'STOP'
    }).replayed, true);
  } finally {
    db.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});


test('linked discussion of unsubscribe features is not an opt-out; explicit unsubscribe remains terminal', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), '3dvr-inbox-unsubscribe-link-'));
  const db = openLedger({ filePath: path.join(tmp, 'ledger.sqlite') });
  try {
    const buyer = createProspect(db, { name: 'Synthetic App Owner', contact: 'owner@test.example' }).prospect;
    transitionProspect(db, { prospectId: buyer.id, toState: 'verified', idempotencyKey: 'ul:v' });
    transitionProspect(db, { prospectId: buyer.id, toState: 'eligible', idempotencyKey: 'ul:e' });
    transitionProspect(db, { prospectId: buyer.id, toState: 'sent', idempotencyKey: 'ul:s' });
    reserveDeliveryAttempt(db, { prospectId: buyer.id, attemptId: 'ul:outbound' });
    finishDeliveryAttempt(db, { attemptId: 'ul:outbound', status: 'acknowledged',
      messageId: '<ul-outbound@test.example>', transport: 'synthetic-test' });

    const linked = {
      fromEmail: 'owner@test.example', subject: 'Re: Customer portal implementation',
      inReplyTo: '<ul-outbound@test.example>'
    };
    for (const [index, preview] of [
      'Could you add an unsubscribe link to the customer portal?',
      'We need to show users how they can unsubscribe from alerts.'
    ].entries()) {
      const reply = projectInboxMessage(db, { ...linked, messageId: 'ul:reply-' + index, preview });
      assert.equal(reply.matched, true);
      assert.equal(reply.prospect.state, 'replied', 'feature discussion must not suppress a buyer');
    }
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM revenue_events WHERE type='inbox_replied'").get().n, 2);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM revenue_events WHERE type='inbox_suppressed'").get().n, 0);
    const unsubscribe = projectInboxMessage(db, { fromEmail: 'owner@test.example',
      messageId: 'ul:optout', preview: 'Please unsubscribe me.' });
    assert.equal(unsubscribe.matched, true);
    assert.equal(unsubscribe.prospect.state, 'suppressed');
    assert.equal(projectInboxMessage(db, { fromEmail: 'owner@test.example',
      messageId: 'ul:optout', preview: 'Please unsubscribe me.' }).replayed, true);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM revenue_events WHERE type='inbox_suppressed'").get().n, 1);
  } finally {
    db.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});


test('direct do-not-email and take-me-off requests suppress without mistaking feature work', () => {
  const { inboxState } = require('../thomas-agent/node/revenue-inbox-projection');
  assert.equal(inboxState({ preview: 'Please take me off your mailing list.' }), 'suppressed');
  assert.equal(inboxState({ preview: 'Don’t email me again.' }), 'suppressed');
  assert.equal(inboxState({ preview: 'Please add a take me off your list option.' }), 'replied');
  assert.equal(inboxState({ preview: 'Can you add a “don’t email me” setting?' }), 'replied');

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), '3dvr-inbox-direct-optout-'));
  const db = openLedger({ filePath: path.join(tmp, 'ledger.sqlite') });
  try {
    const buyer = createProspect(db, { name: 'Synthetic Buyer', contact: 'optout@test.example' }).prospect;
    for (const [step, state] of ['verified', 'eligible', 'sent'].entries()) {
      transitionProspect(db, { prospectId: buyer.id, toState: state,
        idempotencyKey: 'direct-optout:' + step });
    }
    reserveDeliveryAttempt(db, { prospectId: buyer.id, attemptId: 'direct-optout:outbound' });
    finishDeliveryAttempt(db, { attemptId: 'direct-optout:outbound', status: 'acknowledged',
      messageId: '<direct-optout-outbound@test.example>', transport: 'synthetic-test' });
    const feature = projectInboxMessage(db, {
      fromEmail: 'optout@test.example', messageId: 'direct-optout:feature',
      inReplyTo: '<direct-optout-outbound@test.example>',
      preview: 'Please add a take me off your list option.'
    });
    assert.equal(feature.matched, true);
    assert.equal(feature.prospect.state, 'replied');
    const request = { fromEmail: 'optout@test.example', messageId: 'direct-optout:request',
      preview: 'Don’t email me again.' };
    const suppressed = projectInboxMessage(db, request);
    assert.equal(suppressed.prospect.state, 'suppressed');
    assert.equal(projectInboxMessage(db, request).replayed, true);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM revenue_events WHERE type='inbox_suppressed'").get().n, 1);
  } finally {
    db.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

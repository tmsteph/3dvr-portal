const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createProspect, openLedger, transitionProspect } = require('../thomas-agent/node/revenue-ledger');
const { inboxState, projectInboxMessage } = require('../thomas-agent/node/revenue-inbox-projection');
const { consumeInboxState } = require('../thomas-agent/node/revenue-inbox-consumer');

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


test('one multi-recipient bounce updates each prospect without cross-contact idempotency collisions', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), '3dvr-inbox-multi-bounce-'));
  const db = openLedger({ filePath: path.join(tmp, 'ledger.sqlite') });
  try {
    const contacts = ['first@test.example', 'second@test.example'];
    for (const [index, contact] of contacts.entries()) {
      const prospect = createProspect(db, { name: `Synthetic ${index}`, contact }).prospect;
      for (const [state, suffix] of [['verified', 'verified'], ['eligible', 'eligible'], ['sent', 'sent']]) {
        transitionProspect(db, {
          prospectId: prospect.id, toState: state,
          idempotencyKey: `multi-bounce:${index}:${suffix}`
        });
      }
    }
    const filePath = path.join(tmp, 'inbox-state.json');
    fs.writeFileSync(filePath, JSON.stringify({ messages: {
      'shared-provider-message-id': {
        from: 'mailer-daemon',
        subject: 'Delivery Status Notification (Failure)',
        bounceEmails: contacts
      }
    } }));
    const first = consumeInboxState(db, filePath);
    assert.deepEqual(first, { scanned: 2, matched: 2, unmatched: 0, errors: [] });
    for (const contact of contacts) {
      assert.equal(db.prepare('SELECT state FROM prospects WHERE contact_key = ?')
        .get(`contact:${contact}`).state, 'bounced');
    }
    const count = db.prepare("SELECT COUNT(*) AS n FROM revenue_events WHERE type = 'inbox_bounced'").get().n;
    assert.equal(count, 2);
    const replay = consumeInboxState(db, filePath);
    assert.deepEqual(replay, { scanned: 2, matched: 2, unmatched: 0, errors: [] });
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM revenue_events WHERE type = 'inbox_bounced'").get().n, 2);
  } finally { db.close(); fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('recipient-only delivery failures are consumed and block unsafe follow-ups', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), '3dvr-inbox-recipient-only-'));
  const db = openLedger({ filePath: path.join(tmp, 'ledger.sqlite') });
  try {
    const contacts = ['recipient@test.example', 'original@test.example'];
    for (const [index, contact] of contacts.entries()) {
      const prospect = createProspect(db, { name: `Synthetic ${index}`, contact }).prospect;
      for (const [state, suffix] of [['verified', 'v'], ['eligible', 'e'], ['sent', 's']]) {
        transitionProspect(db, {
          prospectId: prospect.id, toState: state,
          idempotencyKey: `recipient-only:${index}:${suffix}`
        });
      }
    }
    const filePath = path.join(tmp, 'inbox-state.json');
    fs.writeFileSync(filePath, JSON.stringify({ messages: {
      'delivery-recipient': {
        recipient: contacts[0], from: 'mailer-daemon',
        subject: 'Delivery Status Notification (Failure)'
      },
      'delivery-original-recipient': {
        originalRecipient: contacts[1], from: 'mailer-daemon',
        subject: 'Delivery Status Notification (Failure)'
      }
    } }));
    assert.deepEqual(consumeInboxState(db, filePath),
      { scanned: 2, matched: 2, unmatched: 0, errors: [] });
    for (const contact of contacts) {
      assert.equal(db.prepare('SELECT state FROM prospects WHERE contact_key = ?')
        .get(`contact:${contact}`).state, 'bounced');
    }
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM revenue_events WHERE type = 'inbox_bounced'").get().n, 2);
    assert.deepEqual(consumeInboxState(db, filePath),
      { scanned: 2, matched: 2, unmatched: 0, errors: [] });
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM revenue_events WHERE type = 'inbox_bounced'").get().n, 2);
  } finally { db.close(); fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('ordinary replies cannot use unrelated bounce recipient hints to advance another prospect', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), '3dvr-inbox-bounce-hints-'));
  const db = openLedger({ filePath: path.join(tmp, 'ledger.sqlite') });
  try {
    const sender = createProspect(db, { name: 'Sender', contact: 'sender@test.example' }).prospect;
    const unrelated = createProspect(db, { name: 'Unrelated', contact: 'unrelated@test.example' }).prospect;
    for (const [index, prospect] of [sender, unrelated].entries()) {
      for (const state of ['verified', 'eligible', 'sent']) {
        transitionProspect(db, {
          prospectId: prospect.id, toState: state,
          idempotencyKey: `reply-hints:${index}:${state}`,
        });
      }
    }
    const filePath = path.join(tmp, 'inbox-state.json');
    fs.writeFileSync(filePath, JSON.stringify({ messages: {
      'ordinary-reply': {
        fromEmail: 'sender@test.example',
        subject: 'Re: proposal',
        bounceEmails: ['unrelated@test.example'],
      },
    } }));
    assert.deepEqual(consumeInboxState(db, filePath),
      { scanned: 1, matched: 1, unmatched: 0, errors: [] });
    assert.equal(db.prepare('SELECT state FROM prospects WHERE id = ?').get(sender.id).state, 'replied');
    assert.equal(db.prepare('SELECT state FROM prospects WHERE id = ?').get(unrelated.id).state, 'sent');
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM revenue_events WHERE type = 'inbox_replied'").get().n, 1);
    assert.deepEqual(consumeInboxState(db, filePath),
      { scanned: 1, matched: 1, unmatched: 0, errors: [] });
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM revenue_events WHERE type = 'inbox_replied'").get().n, 1);
  } finally { db.close(); fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('ordinary scheduling replies mentioning stop do not suppress the prospect', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), '3dvr-inbox-stop-by-'));
  const db = openLedger({ filePath: path.join(tmp, 'ledger.sqlite') });
  try {
    const prospect = createProspect(db, { name: 'Scheduling reply', contact: 'scheduler@test.example' }).prospect;
    for (const state of ['verified', 'eligible', 'sent']) {
      transitionProspect(db, { prospectId: prospect.id, toState: state, idempotencyKey: `stop-by:${state}` });
    }
    const reply = projectInboxMessage(db, {
      fromEmail: 'scheduler@test.example', messageId: 'stop-by-reply',
      subject: 'Re: integration call', preview: 'Can you stop by Tuesday to discuss the API?',
    });
    assert.equal(reply.prospect.state, 'replied');
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM revenue_events WHERE type = 'inbox_suppressed'").get().n, 0);
  } finally { db.close(); fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('standalone STOP and explicit opt-outs remain suppressed; delivery failures take precedence', () => {
  assert.equal(inboxState({ subject: 'Re: meeting', preview: 'STOP' }), 'suppressed');
  assert.equal(inboxState({ subject: 'Re: meeting', preview: 'Please stop emailing me.' }), 'suppressed');
  assert.equal(inboxState({ subject: 'Unsubscribe me' }), 'suppressed');
  assert.equal(inboxState({ from: 'mailer-daemon', subject: 'Delivery Status Notification (Failure)',
    preview: 'Original message footer: unsubscribe or stop' }), 'bounced');
  assert.equal(inboxState({ from: 'unsubscribe@vendor.test', subject: 'Re: meeting',
    preview: 'Please stop by Tuesday.' }), 'replied');
});

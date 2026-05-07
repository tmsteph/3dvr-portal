const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp, readFile, rm, writeFile } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  extractBounceEmails,
  looksLikeBounce,
  classifyInboxMessages,
  printInboxTriage,
  updateLeadStatusByEmail,
  buildBounceAlert,
} = require('../thomas-agent/node/inbox-monitor');

test('detects bounce mail and extracts candidate addresses', () => {
  const message = {
    from: 'Mail Delivery Subsystem <mailer-daemon@gmail.com>',
    subject: 'Delivery Status Notification (Failure)',
    preview: 'Delivery to the following recipient failed permanently: hello@example.com',
    replyTo: '',
  };

  assert.equal(looksLikeBounce(message), true);
  assert.deepEqual(extractBounceEmails(message), ['hello@example.com']);
});

test('builds a bounce alert for the operator', () => {
  const alert = buildBounceAlert({
    from: 'MAILER-DAEMON <mailer-daemon@googlemail.com>',
    subject: 'Undeliverable: outreach',
    preview: 'Recipient address rejected: bad@example.com',
    replyTo: '',
  }, ['bad@example.com']);

  assert.match(alert.subject, /delivery failure/i);
  assert.match(alert.text, /bad@example\.com/);
  assert.match(alert.text, /ask-track view/);
});

test('marks a lead failed by email address', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), '3dvr-bounce-'));
  const leads = path.join(tmp, 'leads.csv');
  await writeFile(
    leads,
    'name,link,contact,status,date,variant\nBad Lead,https://bad.example,mailto:bad@example.com,contacted,2026-05-03,opener\n',
  );

  try {
    const changed = updateLeadStatusByEmail(leads, 'bad@example.com', 'failed');
    const text = await readFile(leads, 'utf8');

    assert.equal(changed, true);
    assert.match(text, /Bad Lead,https:\/\/bad\.example,mailto:bad@example\.com,failed,2026-05-03,opener/);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('triages contacted replies separately from delivery noise', () => {
  const leadMap = new Map([
    ['lead@example.com', { name: 'Acme Studio', contact: 'mailto:lead@example.com' }],
  ]);
  const messages = [
    {
      messageId: 'reply-1',
      from: 'Jordan Lead <lead@example.com>',
      fromEmail: 'lead@example.com',
      replyToEmail: 'lead@example.com',
      subject: 'Re: website question',
      preview: 'Can you take a look at the homepage?',
    },
    {
      messageId: 'bounce-1',
      from: 'Mail Delivery Subsystem <mailer-daemon@gmail.com>',
      fromEmail: 'mailer-daemon@gmail.com',
      replyToEmail: '',
      subject: 'Delivery Status Notification (Failure)',
      preview: 'Recipient address rejected: bad@example.com',
    },
    {
      messageId: 'other-1',
      from: 'Random Reader <reader@example.com>',
      fromEmail: 'reader@example.com',
      replyToEmail: '',
      subject: 'Hello there',
      preview: 'Just saying hi.',
    },
  ];
  const output = [];
  const originalLog = console.log;

  try {
    console.log = (...args) => {
      output.push(args.join(' '));
    };

    const triage = classifyInboxMessages(messages, leadMap);
    printInboxTriage(messages, leadMap);

    assert.equal(triage.replyCandidates.length, 1);
    assert.equal(triage.bounceCandidates.length, 1);
    assert.equal(triage.otherUnread.length, 1);
    assert.match(output.join('\n'), /Inbox triage/);
    assert.match(output.join('\n'), /contacted replies: 1/);
    assert.match(output.join('\n'), /delivery failures: 1/);
    assert.match(output.join('\n'), /other unread: 1/);
    assert.match(output.join('\n'), /Contacted-lead replies:/);
    assert.match(output.join('\n'), /Delivery noise:/);
    assert.match(output.join('\n'), /Other unread:/);
  } finally {
    console.log = originalLog;
  }
});

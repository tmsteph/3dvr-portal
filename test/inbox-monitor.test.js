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
  isPublicAgentMessage,
  looksLikeAutomatedSender,
  subjectMatchesPublicAgentGate,
  recordLeadReplyFeedback,
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

test('records a reply once and attributes it to the outbound experiment variant', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), '3dvr-reply-feedback-'));
  const leads = path.join(tmp, 'leads.csv');
  const log = path.join(tmp, 'outreach.ndjson');
  await writeFile(
    leads,
    'name,link,contact,status,date,variant\nAcme,https://acme.example,mailto:lead@example.com,contacted,2026-07-15,route=email\n',
  );
  const state = { messages: { 'reply-1': {} } };
  const message = {
    messageId: 'reply-1',
    fromEmail: 'lead@example.com',
    replyToEmail: 'lead@example.com',
    subject: 'Re: A free one-page website for Acme',
  };
  const lead = { name: 'Acme', link: 'https://acme.example', contact: 'mailto:lead@example.com', variant: 'route=email' };
  const entries = [{
    experiment: 'campaign', variant: 'b', status: 'sent', name: 'Acme', contact: 'mailto:lead@example.com',
  }];

  try {
    const first = recordLeadReplyFeedback(message, lead, state, {
      entries,
      leadsFile: leads,
      logOptions: { filePath: log },
    });
    const second = recordLeadReplyFeedback(message, lead, state, {
      entries,
      leadsFile: leads,
      logOptions: { filePath: log },
    });
    const leadText = await readFile(leads, 'utf8');
    const logLines = (await readFile(log, 'utf8')).trim().split('\n').map(JSON.parse);

    assert.equal(first.recorded, true);
    assert.equal(first.feedback.experiment, 'campaign');
    assert.equal(first.feedback.variant, 'b');
    assert.equal(second.recorded, false);
    assert.match(leadText, /mailto:lead@example\.com,replied/);
    assert.equal(logLines.length, 1);
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

test('triages subject-gated public 3dvr-agent requests separately', () => {
  const messages = [
    {
      messageId: 'public-1',
      from: 'New Sender <new@example.com>',
      fromEmail: 'new@example.com',
      replyToEmail: '',
      subject: 'Need help from 3dvr-agent',
      preview: 'Can you look at my site?',
    },
    {
      messageId: 'other-1',
      from: 'Random Reader <reader@example.com>',
      fromEmail: 'reader@example.com',
      replyToEmail: '',
      subject: 'Hello there',
      preview: 'Just saying hi.',
    },
    {
      messageId: 'auto-1',
      from: 'Notifications <notifications@example.com>',
      fromEmail: 'notifications@example.com',
      replyToEmail: '',
      subject: '3dvr-agent system notice',
      preview: 'Automated mail.',
    },
  ];
  const output = [];
  const originalLog = console.log;

  try {
    console.log = (...args) => {
      output.push(args.join(' '));
    };

    const triage = classifyInboxMessages(messages, new Map());
    printInboxTriage(messages, new Map());

    assert.equal(subjectMatchesPublicAgentGate(messages[0]), true);
    assert.equal(isPublicAgentMessage(messages[0]), true);
    assert.equal(looksLikeAutomatedSender(messages[2]), true);
    assert.equal(isPublicAgentMessage(messages[2]), false);
    assert.equal(triage.publicAgentCandidates.length, 1);
    assert.equal(triage.otherUnread.length, 2);
    assert.match(output.join('\n'), /public 3dvr-agent requests: 1/);
    assert.match(output.join('\n'), /Public 3dvr-agent requests:/);
  } finally {
    console.log = originalLog;
  }
});

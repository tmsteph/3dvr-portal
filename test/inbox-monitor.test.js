const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp, readFile, rm, writeFile } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  extractBounceEmails,
  looksLikeBounce,
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

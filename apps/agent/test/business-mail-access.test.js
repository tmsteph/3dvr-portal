const test = require('node:test');
const assert = require('node:assert/strict');
const { buildAlertItems, shouldSendEmail } = require('../thomas-agent/node/autopilot');
const { pickInboxAlertCandidates } = require('../thomas-agent/node/inbox-monitor');
const { mailToolCall } = require('../mcp/mail-client');

test('quiet-hours notices neither report a stuck campaign nor send operator mail', () => {
  for (const reason of [
    'quiet hours (America/Los_Angeles; send window 07:00-20:00, every day)',
    'outside business hours (America/Los_Angeles, 08:30-16:30, Monday-Friday)',
  ]) {
    assert.deepEqual(buildAlertItems({ campaign: { sendBlockedReason: reason } }), []);
    assert.equal(shouldSendEmail({ actions: ['Review leads'], state: {}, sendBlockedReason: reason }).send, false);
  }
  assert.match(buildAlertItems({ campaign: { sendBlockedReason: 'mail credential unavailable' } })[0], /Campaign stuck/);
});

test('only fresh business requests and contacted-lead replies interrupt the operator', () => {
  const invite = { messageId: 'invite', fromEmail: 'paperlesspost@paperlesspost.com', subject: 'Fall Appreciation Gathering', preview: '' };
  const reply = { messageId: 'reply', fromEmail: 'owner@example.com', subject: 'Re: workflow repair', preview: 'Yes, please.' };
  const bounce = { messageId: 'bounce', from: 'mailer-daemon@gmail.com', subject: 'Delivery Status Notification (Failure)', preview: '' };
  const leads = new Map([['owner@example.com', { name: 'Prospect' }]]);
  assert.deepEqual(pickInboxAlertCandidates([invite, reply, bounce], leads, { seen: {} }), [reply]);
  assert.deepEqual(pickInboxAlertCandidates([reply], leads, { seen: { reply: 'already-alerted' } }), []);
});

test('mail CLI requires mailbox selection and exposes only account, search, and read tools', () => {
  assert.equal(mailToolCall(['accounts']).name, 'accounts_list');
  assert.deepEqual(mailToolCall(['search', '3dvr', 'newer_than:7d']), {
    name: 'gmail_search', arguments: { account_id: '3dvr', query: 'newer_than:7d', max_results: 25 },
  });
  assert.equal(mailToolCall(['read', '3dvr', '704', 'full']).arguments.format, 'full');
  assert.throws(() => mailToolCall(['search']), /Select a mailbox/);
  assert.throws(() => mailToolCall(['send', '3dvr', 'anything']), /Use accounts/);
  assert.throws(() => mailToolCall(['read', '3dvr', '704', 'raw']), /Use accounts/);
});

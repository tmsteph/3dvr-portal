const test = require('node:test');
const assert = require('node:assert/strict');

const {
  campaignIsActive,
  getFollowupEligibility,
  getCampaignAllowance,
  successfulRecipientKeys,
} = require('../thomas-agent/node/campaign-limits');

test('campaign allowance enforces daily and total successful-send caps', () => {
  const entries = [
    { timestamp: '2026-07-15T08:00:00.000Z', status: 'sent', experiment: 'sd-free-page' },
    { timestamp: '2026-07-15T09:00:00.000Z', status: 'sent', experiment: 'other-campaign' },
    { timestamp: '2026-07-14T09:00:00.000Z', status: 'submitted', experiment: 'sd-free-page' },
    { timestamp: '2026-07-15T10:00:00.000Z', status: 'send_failed', experiment: 'sd-free-page' },
  ];

  const allowance = getCampaignAllowance(entries, {
    campaignId: 'sd-free-page',
    dailyLimit: 5,
    totalLimit: 4,
    start: '2026-07-15',
    end: '2026-07-21',
    today: '2026-07-15',
  });

  assert.equal(allowance.active, true);
  assert.equal(allowance.dailySent, 2);
  assert.equal(allowance.campaignSent, 2);
  assert.equal(allowance.dailyRemaining, 3);
  assert.equal(allowance.totalRemaining, 2);
  assert.equal(allowance.allowed, 2);
});

test('campaign allowance blocks sends outside the active date range', () => {
  assert.equal(campaignIsActive({ start: '2026-07-15', end: '2026-07-21', today: '2026-07-14' }), false);
  assert.equal(campaignIsActive({ start: '2026-07-15', end: '2026-07-21', today: '2026-07-22' }), false);
  assert.equal(getCampaignAllowance([], {
    dailyLimit: 5,
    start: '2026-07-15',
    end: '2026-07-21',
    today: '2026-07-22',
  }).allowed, 0);
});

test('successful recipient keys suppress already-contacted names and addresses', () => {
  const keys = successfulRecipientKeys([
    { status: 'sent', name: 'Acme Studio', contact: 'mailto:owner@example.com' },
    { status: 'send_failed', name: 'Retry Me', contact: 'mailto:retry@example.com' },
  ]);

  assert.equal(keys.has('name:acme studio'), true);
  assert.equal(keys.has('contact:mailto:owner@example.com'), true);
  assert.equal(keys.has('name:retry me'), false);
});

test('no-response follow-up requires 21 days and allows only one', () => {
  const lead = { name: 'Acme Studio', contact: 'mailto:owner@example.com' };
  const initial = {
    timestamp: '2026-07-01T10:00:00.000Z',
    status: 'sent',
    name: lead.name,
    contact: lead.contact,
    subject: 'A free page for Acme Studio',
  };

  assert.deepEqual(
    getFollowupEligibility([initial], lead, { now: '2026-07-20T10:00:00.000Z' }),
    {
      eligible: false,
      retired: false,
      reason: 'wait at least 21 days after initial outreach',
      followupCount: 0,
      ageDays: 19,
    },
  );
  assert.equal(
    getFollowupEligibility([initial], lead, { now: '2026-07-22T10:00:00.000Z' }).eligible,
    true,
  );

  const followup = {
    ...initial,
    timestamp: '2026-07-22T10:00:00.000Z',
    variant: 'follow-up',
    subject: 'Quick follow-up',
  };
  const retired = getFollowupEligibility([initial, followup], lead, {
    now: '2026-08-30T10:00:00.000Z',
  });
  assert.equal(retired.eligible, false);
  assert.equal(retired.retired, true);
  assert.equal(retired.followupCount, 1);
});

test('recipient history matches either normalized name or exact contact route', () => {
  const entries = [{
    timestamp: '2026-07-01T10:00:00.000Z',
    status: 'sent',
    name: 'Different Display Name',
    contact: 'mailto:owner@example.com',
  }];
  const policy = getFollowupEligibility(entries, {
    name: 'Acme Studio',
    contact: 'mailto:owner@example.com',
  }, {
    now: '2026-07-30T10:00:00.000Z',
  });
  assert.equal(policy.eligible, true);
});

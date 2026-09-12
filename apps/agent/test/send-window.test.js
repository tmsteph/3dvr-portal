const assert = require('node:assert/strict');
const test = require('node:test');
const { businessHoursStatus, isPreferredSendWindow, isWithinBusinessHours } = require('../thomas-agent/node/send-window');

test('outreach window allows daytime sends on weekdays and weekends', () => {
  // 2026-07-24 17:00 UTC = Friday 10:00 AM PDT.
  assert.equal(isWithinBusinessHours(new Date('2026-07-24T17:00:00.000Z')), true);
  // 2026-07-25 17:00 UTC = Saturday 10:00 AM PDT.
  assert.equal(isWithinBusinessHours(new Date('2026-07-25T17:00:00.000Z')), true);
  assert.equal(businessHoursStatus(new Date('2026-07-25T17:00:00.000Z')).timezone, 'America/Los_Angeles');
});

test('outreach window blocks quiet hours but keeps a narrower preferred daytime window', () => {
  // 1:00 AM PDT is blocked.
  assert.equal(isWithinBusinessHours(new Date('2026-07-24T08:00:00.000Z')), false);
  // 7:15 PM PDT is allowed, but outside the preferred 8:30 AM-5:30 PM range.
  const evening = new Date('2026-07-25T02:15:00.000Z');
  assert.equal(isWithinBusinessHours(evening), true);
  assert.equal(isPreferredSendWindow(evening), false);
  assert.equal(isPreferredSendWindow(new Date('2026-07-25T17:00:00.000Z')), true);
});

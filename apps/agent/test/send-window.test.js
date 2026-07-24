const assert = require('node:assert/strict');
const test = require('node:test');
const { businessHoursStatus, isWithinBusinessHours } = require('../thomas-agent/node/send-window');

test('outreach window allows a weekday business-hour send', () => {
  // 2026-07-24 17:00 UTC = 10:00 AM PDT.
  const date = new Date('2026-07-24T17:00:00.000Z');
  assert.equal(isWithinBusinessHours(date), true);
  assert.equal(businessHoursStatus(date).timezone, 'America/Los_Angeles');
});

test('outreach window blocks overnight and weekend sends', () => {
  assert.equal(isWithinBusinessHours(new Date('2026-07-24T08:00:00.000Z')), false);
  assert.equal(isWithinBusinessHours(new Date('2026-07-25T17:00:00.000Z')), false);
});

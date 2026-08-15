const test = require('node:test');
const assert = require('node:assert/strict');

const { buildCrmRecord } = require('../thomas-agent/node/crm-sync');

test('contacted leads stay quiet until reply or a new material reason', () => {
  const record = buildCrmRecord({
    name: 'Warm Trial Lead',
    link: 'https://3dvr.tech',
    contact: 'mailto:warm@example.com',
    status: 'contacted',
    date: '2026-08-15',
    variant: 'trial-signup',
  }, { now: '2026-08-15T12:00:00.000Z' });

  assert.equal(record.nextFollowUp, '');
  assert.match(record.nextBestAction, /wait|quiet|reply|new material reason/i);
  assert.doesNotMatch(record.nextBestAction, /follow up later/i);
});

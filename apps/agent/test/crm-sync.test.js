const test = require('node:test');
const assert = require('node:assert/strict');

const { buildCrmRecord } = require('../thomas-agent/node/crm-sync');

test('contacted leads stay quiet until reply or a new material reason', () => {
  const record = buildCrmRecord({
    name: 'Warm Lead',
    link: 'https://example.test',
    contact: 'mailto:lead@example.test',
    status: 'contacted',
    date: '2026-08-14',
    variant: 'revenue-loop',
  }, { now: '2026-08-15T12:00:00.000Z' });

  assert.equal(record.status, 'Warm - Follow-up');
  assert.equal(record.nextFollowUp, '');
  assert.match(record.nextBestAction, /wait|reply|quiet|material reason/i);
  assert.doesNotMatch(record.nextBestAction, /follow up later/i);
});

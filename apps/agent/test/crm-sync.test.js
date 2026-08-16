const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp, rm, writeFile } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  buildCrmRecord,
  buildCrmSyncPayload,
  buildLeadId,
  normalizeEmail,
  parseArgs,
  readLeads,
  shouldSyncLeadToCrm,
  writeCrmSync,
} = require('../thomas-agent/node/crm-sync');

function fakeGunRoot(writes, namespace) {
  return {
    get(id) {
      return {
        put(payload, cb) {
          writes.push({ namespace, id, payload });
          cb({ ok: true });
        },
      };
    },
  };
}

test('buildCrmRecord maps an agent lead into the portal CRM shape', () => {
  const lead = {
    name: 'Point Loma Estate Planning Law APC',
    link: 'https://example-law.test',
    contact: 'mailto:Owner@Example-Law.test',
    status: 'contacted',
    date: '2026-05-27',
    variant: 'route=email',
  };

  const record = buildCrmRecord(lead, { now: '2026-05-27T12:00:00.000Z' });

  assert.equal(record.id, buildLeadId(lead));
  assert.equal(record.recordType, 'person');
  assert.equal(record.email, 'owner@example-law.test');
  assert.equal(record.status, 'Warm - Follow-up');
  assert.equal(record.warmth, 'warm');
  assert.equal(record.marketSegment, 'Professional services');
  assert.equal(record.lastContacted, '2026-05-27');
  assert.equal(record.nextFollowUp, '');
  assert.match(record.tags, /source\/3dvr-agent/);
  assert.match(record.tags, /route\/email/);
  assert.match(record.nextBestAction, /Wait for a reply; stay quiet/);
  assert.match(record.notes, /Synced from 3dvr-agent leads\.csv/);
});

test('buildCrmSyncPayload creates records and stable touch log entries', () => {
  const leads = [
    {
      name: 'Gloss the Salon',
      link: 'https://gloss.example',
      contact: 'https://gloss.example/contact',
      status: 'new',
      date: '2026-05-27',
      variant: 'route=form',
    },
    {
      name: 'Finest City Home and Loans',
      link: 'https://loans.example',
      contact: 'mailto:team@loans.example',
      status: 'contacted',
      date: '2026-05-27',
      variant: 'route=email',
    },
  ];
  const outreach = [
    {
      timestamp: '2026-05-27T09:00:00.000Z',
      kind: 'email',
      status: 'sent',
      name: 'Finest City Home and Loans',
      route: 'email',
      subject: 'Question for Finest City Home and Loans',
    },
    {
      timestamp: '2026-05-27T10:00:00.000Z',
      kind: 'email',
      status: 'sent',
      name: 'Unmatched Lead',
      route: 'email',
    },
  ];

  const payload = buildCrmSyncPayload({
    leads,
    outreach,
    now: '2026-05-27T12:00:00.000Z',
  });

  assert.equal(payload.records.length, 2);
  assert.equal(payload.touches.length, 3);
  assert.equal(payload.touches.filter((touch) => touch.source === '3dvr-agent/leads.csv').length, 2);
  assert.equal(payload.touches.filter((touch) => touch.source === '3dvr-agent/outreach-log').length, 1);
  assert.equal(payload.touches[2].recordId, payload.records[1].id);
  assert.match(payload.touches[2].summary, /Question for Finest City Home and Loans/);
});

test('buildCrmSyncPayload makes outreach the canonical contact and message history', () => {
  const payload = buildCrmSyncPayload({
    leads: [],
    outreach: [{
      timestamp: '2026-07-24T06:00:00.000Z',
      kind: 'email',
      status: 'sent',
      name: 'New Campaign Lead',
      site: 'https://new-lead.example',
      contact: 'mailto:owner@new-lead.example',
      route: 'email',
      subject: 'A practical idea for your business',
      body: 'Here is the exact message that was sent.',
      experiment: '2026-07-new-business-launch',
      variant: 'founder-opener',
      deliveryStatus: 'sent',
      nextFollowUp: '2026-07-31',
    }],
    now: '2026-07-24T06:01:00.000Z',
  });

  assert.equal(payload.records.length, 1);
  assert.equal(payload.records[0].status, 'Warm - Follow-up');
  assert.equal(payload.records[0].lastCampaign, '2026-07-new-business-launch');
  assert.equal(payload.records[0].lastVariant, 'founder-opener');
  assert.equal(payload.records[0].lastMessage, 'Here is the exact message that was sent.');
  assert.equal(payload.records[0].nextFollowUp, '2026-07-31');
  assert.equal(payload.touches.length, 2);
  const messageTouch = payload.touches.find(touch => touch.source === '3dvr-agent/outreach-log');
  assert.equal(messageTouch.message, 'Here is the exact message that was sent.');
  assert.equal(messageTouch.campaignId, '2026-07-new-business-launch');
  assert.equal(messageTouch.touchType, 'outreach-sent');
});

test('buildCrmSyncPayload deduplicates a lead and its outreach by email', () => {
  const payload = buildCrmSyncPayload({
    leads: [{ name: 'Known Lead', link: 'https://known.example', contact: 'mailto:owner@known.example', status: 'new' }],
    outreach: [{ name: 'Known Lead', contact: 'mailto:owner@known.example', status: 'replied', timestamp: '2026-07-24T06:00:00.000Z', body: 'Reply received.' }],
    now: '2026-07-24T06:01:00.000Z',
  });

  assert.equal(payload.records.length, 1);
  assert.equal(payload.records[0].status, 'Warm - Discovery');
  assert.equal(payload.records[0].replyCount, 1);
  assert.equal(payload.touches.length, 2);
  assert.equal(payload.touches.find(touch => touch.source === '3dvr-agent/outreach-log').touchType, 'reply-received');
});

test('shouldSyncLeadToCrm keeps the default CRM import focused on useful leads', () => {
  assert.equal(shouldSyncLeadToCrm({
    name: 'Starbucks',
    link: 'https://www.starbucks.com/store-locator/store/123/example',
    contact: 'mailto:investorrelations@starbucks.com',
    status: 'contacted',
    variant: 'route=email',
  }), false);
  assert.equal(shouldSyncLeadToCrm({
    name: 'Thomas Stephens Test',
    link: 'https://tmsteph.com',
    contact: 'mailto:tmsteph@example.com',
    status: 'contacted',
    variant: 'test-auto-reply',
  }), false);
  assert.equal(shouldSyncLeadToCrm({
    name: 'Finest City Home and Loans',
    link: 'https://finestcityliving.com/',
    contact: 'https://finestcityliving.com/contact',
    status: 'new',
    variant: 'route=form',
  }), true);
  assert.equal(shouldSyncLeadToCrm({
    name: 'Starbucks',
    link: 'https://www.starbucks.com/store-locator/store/123/example',
    contact: 'mailto:investorrelations@starbucks.com',
    status: 'contacted',
    variant: 'route=email',
  }, { includeAll: true }), true);
});

test('readLeads and parseArgs support previewing scoped sync runs', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), '3dvr-crm-sync-'));
  const leadsFile = path.join(tmp, 'leads.csv');

  try {
    await writeFile(leadsFile, [
      'name,link,contact,status,date,variant',
      'First Lead,https://first.example,mailto:first@example.com,new,2026-05-27,route=email',
      'Second Lead,https://second.example,https://second.example/contact,contacted,2026-05-26,route=form',
      '',
    ].join('\n'));

    const args = parseArgs(['--dry-run', '--limit', '1', '--leads-file', leadsFile, '--no-outreach-log', '--include-all']);
    const leads = readLeads(args.leadsFile);
    const payload = buildCrmSyncPayload({ leads, limit: args.limit, now: '2026-05-27T12:00:00.000Z' });

    assert.equal(args.dryRun, true);
    assert.equal(args.noOutreachLog, true);
    assert.equal(args.includeAll, true);
    assert.equal(payload.records.length, 1);
    assert.equal(payload.records[0].name, 'First Lead');
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('writeCrmSync writes records and touches through provided Gun roots', async () => {
  const writes = [];
  const payload = buildCrmSyncPayload({
    leads: [{
      name: 'Ballast Point',
      link: 'https://ballast.example',
      contact: 'https://ballast.example/contact',
      status: 'new',
      date: '2026-05-27',
      variant: 'route=form',
    }],
    outreach: [],
    now: '2026-05-27T12:00:00.000Z',
  });

  const result = await writeCrmSync(payload, {
    crmRoot: fakeGunRoot(writes, 'crm'),
    touchRoot: fakeGunRoot(writes, 'touch'),
    timeoutMs: 100,
  });

  assert.deepEqual(result, { records: 1, touches: 1, errors: [] });
  assert.equal(writes.length, 2);
  assert.equal(writes[0].namespace, 'crm');
  assert.equal(writes[0].id, payload.records[0].id);
  assert.equal(writes[1].namespace, 'touch');
  assert.equal(writes[1].id, payload.touches[0].id);
});

test('normalizeEmail strips mailto and rejects non-email contacts', () => {
  assert.equal(normalizeEmail('mailto:Owner@Example.com'), 'owner@example.com');
  assert.equal(normalizeEmail('https://example.com/contact'), '');
});

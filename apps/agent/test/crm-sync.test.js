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

test('a closed CSV lead is not proof of a won or paid customer', () => {
  const record = buildCrmRecord({
    name: 'Synthetic Closed Lead',
    link: 'https://closed.example',
    contact: 'mailto:owner@closed.example',
    status: 'closed',
    date: '2026-11-17',
    variant: 'manual-closure',
  }, { now: '2026-11-18T09:00:00.000Z' });

  assert.equal(record.status, 'Closed');
  assert.equal(record.pilotStatus, 'Watching');
  assert.equal(record.warmth, 'cold');
  assert.equal(record.lastContacted, '', 'closing a record does not prove a contact happened');
  assert.match(record.nextBestAction, /do not contact automatically/);
  assert.doesNotMatch(record.status + ' ' + record.pilotStatus, /Won|Customer|Paid/);
});

test('historical outreach must not reopen a manually closed lead', () => {
  const lead = {
    name: 'Synthetic Closed Lead',
    link: 'https://closed.example',
    contact: 'mailto:owner@closed.example',
    status: 'closed',
    date: '2026-11-17',
    variant: 'manual-closure',
  };
  const payload = buildCrmSyncPayload({
    leads: [lead],
    outreach: [{
      timestamp: '2026-11-10T12:00:00.000Z',
      name: lead.name,
      site: lead.link,
      contact: lead.contact,
      status: 'sent',
      messageId: 'synthetic-old-message',
      kind: 'email',
    }],
    now: '2026-11-18T09:00:00.000Z',
  });
  assert.equal(payload.records.length, 1);
  assert.equal(payload.records[0].status, 'Closed');
  assert.equal(payload.records[0].pilotStatus, 'Watching');
  assert.match(payload.records[0].nextBestAction, /do not contact automatically/);
  assert.equal(payload.touches.length, 2, 'keep history without implying a new customer or reopening');
});

test('suppressed and closed leads cannot reopen or inherit follow-ups from historical replies', () => {
  for (const status of ['closed', 'suppressed', 'unsubscribed', 'opted-out', 'do-not-contact']) {
    const lead = {
      name: 'Synthetic Opt Out', link: 'https://opt-out.example',
      contact: 'mailto:owner@opt-out.example', status, date: '2026-11-19',
    };
    const payload = buildCrmSyncPayload({
      leads: [lead],
      outreach: [{
        name: lead.name, contact: lead.contact, site: lead.link, status: 'replied',
        timestamp: '2026-11-18T12:00:00.000Z', nextFollowUp: '2026-11-25',
        body: 'Synthetic historical reply',
      }],
      now: '2026-11-20T08:00:00.000Z',
    });
    assert.equal(payload.records.length, 1, status);
    const record = payload.records[0];
    assert.equal(record.status, 'Closed', status);
    assert.match(record.nextBestAction, /do not contact/i, status);
    assert.equal(record.nextFollowUp, '', status + ' cannot inherit a follow-up reminder');
    assert.equal(record.lastContacted, '', status + ' was not reopened');
    const replyTouches = payload.touches.filter(touch => touch.touchType === 'reply-received');
    assert.equal(replyTouches.length, 1, status + ' should retain historic reply evidence');
    assert.equal(replyTouches[0].nextFollowUp, '', status + ' cannot schedule a follow-up through a touch');
  }
});

test('duplicate CSV rows resolve to one CRM identity with attributable outreach history', () => {
  const contact = 'mailto:owner@dedupe.example.test';
  const payload = buildCrmSyncPayload({
    leads: [
      { name: 'Synthetic Duplicate', contact, link: 'https://dedupe.example.test', status: 'new', date: '2026-11-18' },
      { name: 'Synthetic Duplicate', contact: 'OWNER@dedupe.example.test', link: 'https://dedupe.example.test',
        status: 'contacted', date: '2026-11-19' },
    ],
    outreach: [{
      name: 'Synthetic Duplicate', contact, status: 'sent',
      timestamp: '2026-11-19T12:00:00.000Z', messageId: 'dedupe-test-message',
    }],
    now: '2026-11-20T12:00:00.000Z',
    includeAll: true,
  });
  assert.equal(payload.records.length, 1, 'one person must not appear as two CRM records');
  assert.equal(payload.records[0].status, 'Warm - Follow-up');
  assert.equal(payload.records[0].lastContacted, '2026-11-19');
  assert.equal(payload.touches.length, 2, 'one lead note and one attributable sent touch');
  assert.equal(payload.touches.filter(t => t.touchType === 'outreach-sent').length, 1);
  assert.ok(payload.touches.every(t => t.recordId === payload.records[0].id));
});

test('duplicate CSV rows cannot reopen a suppressed contact or schedule outreach', () => {
  const contact = 'owner@closed-duplicate.example.test';
  const payload = buildCrmSyncPayload({
    leads: [
      { name: 'Synthetic Opt Out', contact, status: 'opted-out', date: '2026-11-17' },
      { name: 'Synthetic Opt Out', contact: 'mailto:' + contact, status: 'new', date: '2026-11-20' },
    ],
    outreach: [{
      name: 'Synthetic Opt Out', contact, status: 'sent', nextFollowUp: '2026-11-25',
      timestamp: '2026-11-18T12:00:00.000Z',
    }],
    now: '2026-11-20T12:00:00.000Z',
    includeAll: true,
  });
  assert.equal(payload.records.length, 1);
  assert.equal(payload.records[0].status, 'Closed');
  assert.equal(payload.records[0].nextFollowUp, '');
  assert.match(payload.records[0].nextBestAction, /do not contact/i);
  assert.equal(payload.touches.length, 2, 'historical message remains visible without reopening');
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

test('a reply from one of two same-named prospects cannot move the other prospect', () => {
  const payload = buildCrmSyncPayload({
    leads: [
      { name: 'Shared Studio', link: 'https://north.example', contact: 'mailto:north@example.test', status: 'new' },
      { name: 'Shared Studio', link: 'https://south.example', contact: 'mailto:south@example.test', status: 'new' },
    ],
    outreach: [{
      name: 'Shared Studio', contact: 'mailto:south@example.test', status: 'replied',
      timestamp: '2026-11-18T15:00:00.000Z', body: 'Synthetic response (never sent)',
    }],
    now: '2026-11-18T15:01:00.000Z', includeAll: true,
  });
  assert.equal(payload.records.length, 2);
  const north = payload.records.find(record => record.email === 'north@example.test');
  const south = payload.records.find(record => record.email === 'south@example.test');
  assert.equal(north.status, 'Lead');
  assert.equal(north.replyCount, undefined);
  assert.equal(south.status, 'Warm - Discovery');
  assert.equal(south.replyCount, 1);
  const replies = payload.touches.filter(touch => touch.touchType === 'reply-received');
  assert.equal(replies.length, 1);
  assert.equal(replies[0].recordId, south.id, 'reply touch must belong to the matching email');
});

test('ambiguous name-only reply is not attributed to either buyer', () => {
  const payload = buildCrmSyncPayload({
    leads: [
      { name: 'Shared Studio', link: 'https://north.example', contact: 'north@example.test', status: 'new' },
      { name: 'Shared Studio', link: 'https://south.example', contact: 'south@example.test', status: 'new' },
    ],
    outreach: [{
      name: 'Shared Studio', site: 'https://unknown.example', status: 'replied',
      timestamp: '2026-11-18T15:00:00.000Z', body: 'Unattributed synthetic response',
    }],
    now: '2026-11-18T15:01:00.000Z', includeAll: true,
  });
  assert.equal(payload.records.length, 2);
  assert.ok(payload.records.every(record => record.status === 'Lead'));
  assert.ok(payload.records.every(record => record.replyCount === undefined));
  assert.equal(payload.touches.filter(touch => touch.touchType === 'reply-received').length, 0);
});

test('a different concrete contact route cannot impersonate a same-named email buyer', () => {
  const payload = buildCrmSyncPayload({
    leads: [{
      name: 'Shared Studio', link: 'https://north.example',
      contact: 'mailto:north@example.test', status: 'new',
    }],
    outreach: [{
      name: 'Shared Studio', site: 'https://south.example',
      contact: 'https://south.example/contact', status: 'replied',
      timestamp: '2026-11-18T16:00:00.000Z', body: 'Synthetic unverified reply',
    }],
    now: '2026-11-18T16:01:00.000Z', includeAll: true,
  });
  assert.equal(payload.records.length, 1, 'do not invent another lead from a conflicting historical name');
  assert.equal(payload.records[0].email, 'north@example.test');
  assert.equal(payload.records[0].status, 'Lead', 'unrelated reply must not advance CRM');
  assert.equal(payload.records[0].replyCount, undefined);
  assert.equal(payload.touches.filter(touch => touch.touchType === 'reply-received').length, 0);
});

test('same-named leads at different website routes do not borrow reply history', () => {
  const payload = buildCrmSyncPayload({
    leads: [{
      name: 'Shared Studio', link: 'https://north.example',
      contact: 'https://north.example/contact', status: 'new',
    }],
    outreach: [{
      name: 'Shared Studio', site: 'https://south.example',
      contact: 'https://south.example/contact', status: 'replied',
      timestamp: '2026-11-18T16:05:00.000Z', body: 'Synthetic unrelated response',
    }],
    now: '2026-11-18T16:06:00.000Z', includeAll: true,
  });
  assert.equal(payload.records.length, 1);
  assert.equal(payload.records[0].status, 'Lead');
  assert.equal(payload.records[0].replyCount, undefined);
  assert.equal(payload.touches.filter(touch => touch.touchType === 'reply-received').length, 0);
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

test('writeCrmSync fails closed on absent, negative, or errored Gun acknowledgements', async () => {
  const payload = { records: [{ id: 'synthetic-record' }], touches: [{ id: 'synthetic-touch' }] };
  const ackCases = [
    { name: 'missing', ack: undefined },
    { name: 'null', ack: null },
    { name: 'empty object', ack: {} },
    { name: 'local-only ok 0', ack: { ok: 0 } },
    { name: 'explicit false', ack: { ok: false } },
    { name: 'relay error', ack: { err: 'relay unavailable' } },
  ];
  for (const scenario of ackCases) {
    const root = { get() { return { put(_record, callback) { callback(scenario.ack); } }; } };
    const result = await writeCrmSync(payload, { crmRoot: root, touchRoot: root, timeoutMs: 30 });
    assert.equal(result.records, 0, scenario.name + ': no CRM record may be counted');
    assert.equal(result.touches, 0, scenario.name + ': no touch may be counted');
    assert.equal(result.errors.length, 2, scenario.name + ': each missing receipt is an error');
  }
});

test('writeCrmSync rejects a silent Gun transport instead of claiming persistence', async () => {
  const silentRoot = { get() { return { put() {} }; } };
  const result = await writeCrmSync(
    { records: [{ id: 'synthetic-record' }], touches: [{ id: 'synthetic-touch' }] },
    { crmRoot: silentRoot, touchRoot: silentRoot, timeoutMs: 15 }
  );
  assert.deepEqual(result, {
    records: 0,
    touches: 0,
    errors: ['record synthetic-record: crm sync write timeout', 'touch synthetic-touch: crm sync write timeout']
  });
});


test('CRM contact and reply dates follow actual event times, not failed attempts or import order', () => {
  const contact = 'mailto:owner@chronology.example';
  const payload = buildCrmSyncPayload({
    leads: [{
      name: 'Chronology Example',
      link: 'https://chronology.example',
      contact,
      status: 'new',
    }],
    outreach: [
      { name: 'Chronology Example', contact, status: 'failed', timestamp: '2026-11-18T20:00:00.000Z' },
      { name: 'Chronology Example', contact, status: 'replied', timestamp: '2026-11-18T18:00:00.000Z', body: 'Earlier synthetic reply' },
      { name: 'Chronology Example', contact, status: 'sent', timestamp: '2026-11-17T10:00:00.000Z', messageId: 'synthetic-local-id', route: 'email' },
      { name: 'Chronology Example', contact, status: 'replied', timestamp: '2026-11-18T19:00:00.000Z', body: 'Later synthetic reply' },
    ],
    now: '2026-11-18T21:00:00.000Z',
    includeAll: true,
  });
  assert.equal(payload.records.length, 1);
  const record = payload.records[0];
  assert.equal(record.lastContacted, '2026-11-17', 'a later failed attempt cannot advance the last-send date');
  assert.equal(record.replyCount, 2);
  assert.equal(record.lastReplyAt, '2026-11-18T19:00:00.000Z', 'latest reply must not depend on import order');
  assert.equal(record.status, 'Warm - Discovery');
  assert.equal(record.lastDeliveryStatus, 'failed', 'latest event status is still visible separately');
});


test('missing-status and draft outreach log entries remain notes, never sent or failed touches', () => {
  const lead = {
    name: 'Synthetic Review Lead',
    link: 'https://review-only.example.test',
    contact: 'review@review-only.example.test',
    status: 'new',
  };
  for (const status of [undefined, '', 'draft', 'pending_approval']) {
    const payload = buildCrmSyncPayload({
      leads: [lead],
      outreach: [{
        name: lead.name, contact: lead.contact, status,
        timestamp: '2026-11-20T20:00:00.000Z',
        subject: 'Unsent draft only',
      }],
      now: '2026-11-20T20:01:00.000Z',
      includeAll: true,
    });
    assert.equal(payload.records.length, 1);
    assert.equal(payload.records[0].status, 'Lead');
    assert.equal(payload.records[0].lastContacted, '');
    assert.equal(payload.records[0].lastTouchType, 'note');
    const touches = payload.touches.filter(touch => touch.source === '3dvr-agent/outreach-log');
    assert.equal(touches.length, 1);
    assert.equal(touches[0].touchType, 'note', String(status));
    assert.equal(touches[0].type, 'note', String(status));
    assert.equal(payload.touches.filter(touch => touch.touchType === 'outreach-sent').length, 0);
  }
  const failed = buildCrmSyncPayload({
    leads: [lead],
    outreach: [{
      name: lead.name, contact: lead.contact, status: 'failed',
      timestamp: '2026-11-20T20:02:00.000Z',
    }],
    includeAll: true,
  });
  assert.equal(failed.touches.find(touch => touch.source === '3dvr-agent/outreach-log').touchType, 'outreach-failed',
    'explicit failed delivery retains its distinct status');
});

test('failed-only and draft-only outreach history never fabricates a sent contact', () => {
  const failedLead = {
    name: 'Synthetic Failure', link: 'https://failed-only.example',
    contact: 'mailto:owner@failed-only.example', status: 'failed', date: '2026-11-19',
  };
  assert.equal(
    buildCrmRecord(failedLead, { now: '2026-11-19T12:00:00.000Z' }).lastContacted,
    '',
    'failed delivery is not proof the prospect was contacted'
  );
  for (const [status, expectedTouch] of [
    ['failed', 'outreach-failed'],
    ['draft', 'note'],
  ]) {
    const payload = buildCrmSyncPayload({
      leads: [{ ...failedLead, status: 'new' }],
      outreach: [{
        name: failedLead.name, contact: failedLead.contact,
        status, timestamp: '2026-11-19T12:00:00.000Z',
        subject: 'Unsent synthetic message',
      }],
      now: '2026-11-19T12:01:00.000Z',
    });
    assert.equal(payload.records.length, 1);
    assert.equal(payload.records[0].lastContacted, '', status);
    assert.equal(payload.records[0].lastTouchType, expectedTouch, status);
    assert.equal(payload.records[0].replyCount, 0, status);
    assert.equal(
      payload.touches.filter(touch => touch.touchType === 'outreach-sent').length,
      0, status + ' cannot become an acknowledged send'
    );
  }
});

test('colliding legacy CRM slugs quarantine different buyer identities and their outreach', () => {
  const aliceDot = {
    name: 'Synthetic Buyer', link: 'https://synthetic-buyer.example.test',
    contact: 'alice.smith@buyer.example.test', status: 'contacted', date: '2026-11-19',
  };
  const aliceDash = {
    ...aliceDot, contact: 'alice-smith@buyer.example.test',
    status: 'suppressed', date: '2026-11-20',
  };
  const independent = {
    name: 'Independent Buyer', link: 'https://independent.example.test',
    contact: 'owner@independent.example.test', status: 'new', date: '2026-11-20',
  };
  assert.equal(buildLeadId(aliceDot), buildLeadId(aliceDash),
    'legacy slug-based IDs collide despite different valid email addresses');

  const payload = buildCrmSyncPayload({
    leads: [aliceDot, aliceDash, { ...aliceDot, date: '2026-11-21' }, independent],
    outreach: [{
      name: aliceDot.name, contact: aliceDot.contact,
      timestamp: '2026-11-20T12:00:00.000Z', status: 'sent',
      messageId: 'synthetic-not-a-provider-receipt',
    }],
    now: '2026-11-21T09:00:00.000Z',
    includeAll: true,
  });
  assert.deepEqual(payload.identityConflicts, [buildLeadId(aliceDot)]);
  assert.deepEqual(payload.records.map(record => record.email), ['owner@independent.example.test']);
  assert.equal(payload.touches.length, 1, 'no colliding buyer can acquire the other buyer\'s touch history');
  assert.equal(payload.records[0].status, 'Lead', 'unrelated buyer can still be imported');
});

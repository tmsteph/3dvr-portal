const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp, rm, writeFile } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  buildSalesSummary,
  countLeadRoutes,
  countLeadStatuses,
  summarizeInbox,
  summarizeOutreach,
} = require('../thomas-agent/node/sales-summary');

test('sales summary counts lead state, routes, outreach, and inbox state', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), '3dvr-sales-summary-'));
  const leadsFile = path.join(tmp, 'leads.csv');
  const outreachLogFile = path.join(tmp, 'outreach.ndjson');
  const inboxStateFile = path.join(tmp, 'inbox.json');

  await writeFile(leadsFile, [
    'name,link,contact,status,date,variant',
    'Email Lead,https://email.example,mailto:lead@example.com,new,2026-05-14,',
    'Form Lead,https://form.example,https://form.example/contact,new,2026-05-14,route=form',
    'Contact Page,https://page.example,https://page.example/contact,new,2026-05-14,',
    'Contacted Lead,https://done.example,mailto:done@example.com,contacted,2026-05-13,email',
    'Failed Lead,https://bad.example,mailto:bad@example.com,failed,2026-05-13,email',
    '',
  ].join('\n'));

  await writeFile(outreachLogFile, [
    JSON.stringify({ timestamp: '2026-05-14T10:00:00.000Z', status: 'sent', kind: 'email', name: 'Email Lead', route: 'email' }),
    JSON.stringify({ timestamp: '2026-05-14T11:00:00.000Z', status: 'submitted', kind: 'form', name: 'Form Lead', route: 'form' }),
    JSON.stringify({ timestamp: '2026-05-13T09:00:00.000Z', status: 'failed', kind: 'email', name: 'Failed Lead', route: 'email', note: 'bounce' }),
    '',
  ].join('\n'));

  await writeFile(inboxStateFile, JSON.stringify({
    lastAlertAt: '2026-05-14T12:00:00.000Z',
    seen: { a: '2026-05-14T12:00:00.000Z' },
    messages: {
      a: { dueAt: '2026-05-14T13:00:00.000Z' },
      b: { dueAt: '2026-05-14T14:00:00.000Z', autoRepliedAt: '2026-05-14T15:00:00.000Z' },
    },
  }));

  try {
    const summary = buildSalesSummary({
      leadsFile,
      outreachLogFile,
      inboxStateFile,
      today: '2026-05-14',
      recentLimit: 2,
      ownerAlias: 'ops@3dvr',
    });

    assert.equal(summary.ownerAlias, 'ops@3dvr');
    assert.equal(summary.leads.statusCounts.total, 5);
    assert.equal(summary.leads.statusCounts.new, 3);
    assert.equal(summary.leads.statusCounts.contacted, 1);
    assert.equal(summary.leads.statusCounts.failed, 1);
    assert.equal(summary.leads.routeCounts.emailReady, 1);
    assert.equal(summary.leads.routeCounts.formReady, 1);
    assert.equal(summary.leads.routeCounts.pageOnly, 1);
    assert.equal(summary.leads.manualReview, 2);
    assert.equal(summary.outreach.contactedToday, 2);
    assert.equal(summary.outreach.sent, 1);
    assert.equal(summary.outreach.submitted, 1);
    assert.equal(summary.outreach.failed, 1);
    assert.equal(summary.outreach.recent.length, 2);
    assert.equal(summary.inbox.messageCount, 2);
    assert.equal(summary.inbox.seenCount, 1);
    assert.equal(summary.inbox.pendingAutoReplies, 1);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('sales summary helpers handle empty input', () => {
  assert.deepEqual(countLeadStatuses([]), {
    total: 0,
    new: 0,
    contacted: 0,
    nurture: 0,
    replied: 0,
    failed: 0,
    closed: 0,
    other: 0,
  });
  assert.deepEqual(countLeadRoutes([]), {
    emailReady: 0,
    formReady: 0,
    pageOnly: 0,
    needsEnrichment: 0,
    other: 0,
  });
  assert.equal(summarizeOutreach([], { today: '2026-05-14' }).contactedToday, 0);
  assert.equal(summarizeInbox({}).pendingAutoReplies, 0);
});

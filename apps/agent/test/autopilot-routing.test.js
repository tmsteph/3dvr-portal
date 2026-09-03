const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildActionItems,
  buildAlertItems,
  countRouteBuckets,
  countStatuses,
  formatRouteCounts,
  gunSafe,
  pickAutoSendLeads,
  splitLocations,
} = require('../thomas-agent/node/autopilot');

test('splitLocations preserves city and state commas', () => {
  assert.deepEqual(splitLocations('San Diego, CA'), ['San Diego, CA']);
  assert.deepEqual(
    splitLocations('San Diego, CA;La Mesa, CA\nEl Cajon, CA'),
    ['San Diego, CA', 'La Mesa, CA', 'El Cajon, CA']
  );
});

test('gunSafe serializes non-finite numbers before Gun persistence', () => {
  assert.deepEqual(gunSafe({ finite: 5, unlimited: Infinity, missing: NaN }), {
    finite: 5,
    unlimited: 'Infinity',
    missing: 'NaN',
  });
});

test('countRouteBuckets separates email, form, page-only, and unenriched new leads', () => {
  const rows = [
    { name: 'Email Lead', status: 'new', link: 'https://example.com', contact: 'mailto:owner@example.com', variant: '' },
    { name: 'Form Lead', status: 'new', link: 'https://form.example', contact: 'https://form.example/contact', variant: 'route=form' },
    { name: 'Page Lead', status: 'new', link: 'https://page.example', contact: 'https://page.example/contact', variant: '' },
    { name: 'Unenriched Lead', status: 'new', link: 'https://weak.example', contact: '', variant: '' },
    { name: 'Old Lead', status: 'contacted', link: 'https://old.example', contact: 'mailto:old@example.com', variant: '' },
  ];

  assert.deepEqual(countStatuses(rows), {
    total: 5,
    new: 4,
    contacted: 1,
    nurture: 0,
    replied: 0,
    closed: 0,
  });
  assert.deepEqual(countRouteBuckets(rows), {
    emailReady: 1,
    formReady: 1,
    phoneReady: 0,
    pageOnly: 2,
    unenriched: 1,
  });
  assert.equal(formatRouteCounts(countRouteBuckets(rows)), 'emailReady=1, formReady=1, phoneReady=0, pageOnly=2, unenriched=1');
});

test('buildActionItems includes form review commands without auto-submitting forms', () => {
  const summary = {
    counts: { new: 3, contacted: 0, nurture: 0, replied: 0, closed: 0 },
    routeCounts: { emailReady: 1, formReady: 1, pageOnly: 1, unenriched: 0 },
    topNew: ['Email Lead', 'Form Lead', 'Page Lead'],
    topReplied: [],
    topForm: ['Form Lead'],
    topPageOnly: ['Page Lead'],
    autoSent: [],
    openAiCosts: { available: false },
    codex: { mode: 'off' },
    errors: [],
  };

  const actions = buildActionItems(summary);

  assert.match(actions.join('\n'), /Review form leads: Form Lead/);
  assert.match(actions.join('\n'), /ask-form "Form Lead"/);
  assert.match(actions.join('\n'), /ask-send "Form Lead"/);
  assert.match(actions.join('\n'), /Review page-only leads: Page Lead/);
  assert.match(actions.join('\n'), /ask-send "Page Lead"/);
});

test('pickAutoSendLeads does not retry successful recipients from the outreach log', () => {
  const rows = [
    { name: 'Already Sent', status: 'new', link: 'https://sent.example', contact: 'mailto:owner@sent.example', date: '2026-07-15' },
    { name: 'Fresh Lead', status: 'new', link: 'https://fresh.example', contact: 'mailto:owner@fresh.example', date: '2026-07-15' },
  ];
  const entries = [
    { status: 'sent', name: 'Already Sent', contact: 'mailto:owner@sent.example' },
  ];

  assert.deepEqual(pickAutoSendLeads(rows, 5, entries).map((lead) => lead.name), ['Fresh Lead']);
});


test('phone-only leads are surfaced for human call review', () => {
  const rows = [{ name: 'No Site Shop', status: 'new', link: '', contact: '+1 619 555 0123', variant: '' }];
  const routeCounts = countRouteBuckets(rows);
  assert.equal(routeCounts.phoneReady, 1);
  const actions = buildActionItems({
    counts: { new: 1, contacted: 0, nurture: 0, replied: 0, closed: 0 },
    routeCounts, topNew: ['No Site Shop'], topReplied: [], topForm: [], topPhone: ['No Site Shop'], topPageOnly: [],
    autoSent: [], openAiCosts: { available: false }, codex: { mode: 'off' }, errors: [], followups: { eligible: 0 },
  });
  assert.match(actions.join('\n'), /Review no-site phone leads: No Site Shop/);
  assert.match(actions.join('\n'), /ask-message phone \"No Site Shop\"/);
});


test('routine operator work stays out of interrupt emails', () => {
  const alerts = buildAlertItems({
    counts: { new: 20, contacted: 3, nurture: 0, replied: 0, closed: 0 },
    topReplied: [],
    autoSent: [
      { name: 'Sent Lead', ok: true, status: 'sent' },
      { name: 'Draft Lead', ok: false, status: 'queued' },
      { name: 'Quality Lead', ok: false, status: 'quality_blocked' },
    ],
    campaign: { sendBlockedReason: 'outside business hours (America/Los_Angeles, 08:30-16:30, Monday-Friday)', draftQueueEnabled: true },
    openAiCosts: { limitExceeded: false },
    codex: { mode: 'codex', ok: true },
  });
  assert.deepEqual(alerts, []);
});

test('only genuinely important campaign events trigger interrupt emails', () => {
  const alerts = buildAlertItems({
    counts: { new: 0, contacted: 3, nurture: 0, replied: 1, closed: 0 },
    topReplied: ['Warm Prospect'],
    autoSent: [{ name: 'Broken Send', ok: false, status: 'send_failed' }],
    campaign: { sendBlockedReason: 'THREEDVR_OUTREACH_POSTAL_ADDRESS is not configured', draftQueueEnabled: true },
    openAiCosts: { limitExceeded: true, totalUsd: 5.5, limitUsd: 5 },
    codex: { mode: 'codex', ok: false, reason: 'auth expired' },
  });
  const text = alerts.join('\n');
  assert.match(text, /Prospect replied: Warm Prospect/);
  assert.match(text, /Outreach send failed: Broken Send/);
  assert.match(text, /Campaign stuck: THREEDVR_OUTREACH_POSTAL_ADDRESS is not configured/);
  assert.match(text, /OpenAI spend guard hit/);
  assert.match(text, /Draft queue blocked: Codex auth expired/);
});

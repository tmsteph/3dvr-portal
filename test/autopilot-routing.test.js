const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildActionItems,
  countRouteBuckets,
  countStatuses,
  formatRouteCounts,
} = require('../thomas-agent/node/autopilot');

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
    pageOnly: 2,
    unenriched: 1,
  });
  assert.equal(formatRouteCounts(countRouteBuckets(rows)), 'emailReady=1, formReady=1, pageOnly=2, unenriched=1');
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

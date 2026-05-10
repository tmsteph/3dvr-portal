const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  appendExperiment,
  buildExperimentPlan,
  buildMarketResearchPrompt,
  experimentId,
  formatExperimentReport,
  readExperiments,
  summarizeExperiments,
} = require('../thomas-agent/node/revenue-ops');

test('market research prompt requests actionable sales intelligence', () => {
  const prompt = buildMarketResearchPrompt({
    market: 'independent restaurants',
    offer: 'online ordering cleanup',
    location: 'San Diego',
  });

  assert.match(prompt, /independent restaurants/);
  assert.match(prompt, /online ordering cleanup/);
  assert.match(prompt, /Top buyer segments/);
  assert.match(prompt, /Messaging angles worth A\/B testing/);
  assert.match(prompt, /7-day action plan/);
});

test('experiment plan creates stable variants and operator instructions', () => {
  const plan = buildExperimentPlan({
    name: 'restaurant followup',
    market: 'restaurants',
    goal: 'Increase qualified replies',
  });

  assert.match(plan.experiment.id, /^\d{4}-\d{2}-\d{2}-restaurant-followup$/);
  assert.equal(plan.experiment.variants.length, 2);
  assert.match(plan.instructions, /THREEDVR_OUTREACH_EXPERIMENT_ID/);
  assert.match(plan.instructions, /3dvr revenue report/);
});

test('experiment records can be saved and read', () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), '3dvr-experiments-'));
  const filePath = path.join(tmp, 'experiments.ndjson');

  try {
    const written = appendExperiment({
      id: 'exp-1',
      name: 'Test experiment',
      goal: 'Learn',
    }, { filePath });
    const records = readExperiments({ filePath });

    assert.equal(written.id, 'exp-1');
    assert.equal(records.length, 1);
    assert.equal(records[0].goal, 'Learn');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('summarizeExperiments groups outreach by experiment and variant', () => {
  const rows = summarizeExperiments([
    { experiment: 'exp-1', variant: 'a', status: 'sent' },
    { experiment: 'exp-1', variant: 'a', status: 'replied' },
    { experiment: 'exp-1', variant: 'b', status: 'send_failed' },
    { experiment: 'exp-1', variant: 'b', status: 'submitted' },
  ]);
  const report = formatExperimentReport(rows);

  assert.equal(rows.length, 2);
  assert.deepEqual(rows.find(row => row.variant === 'a'), {
    experiment: 'exp-1',
    variant: 'a',
    sent: 1,
    submitted: 0,
    failed: 0,
    replies: 1,
    closed: 0,
    entries: 2,
  });
  assert.match(report, /exp-1 \/ a/);
  assert.match(report, /replyRate=100%/);
});

test('experimentId slugifies names', () => {
  assert.equal(experimentId('Restaurants: Follow Up!', '2026-05-10'), '2026-05-10-restaurants-follow-up');
});

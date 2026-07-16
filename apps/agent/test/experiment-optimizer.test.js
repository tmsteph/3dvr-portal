const test = require('node:test');
const assert = require('node:assert/strict');
const {
  chooseExperimentVariant,
  summarizeVariantResults,
} = require('../thomas-agent/node/experiment-optimizer');

test('optimizer balances variants during exploration', () => {
  const entries = [
    { experiment: 'campaign', variant: 'a', status: 'sent' },
    { experiment: 'campaign', variant: 'a', status: 'sent' },
    { experiment: 'campaign', variant: 'b', status: 'sent' },
  ];
  const decision = chooseExperimentVariant(entries, {
    campaignId: 'campaign',
    variants: ['a', 'b'],
    minSampleSize: 3,
  });
  assert.equal(decision.variant, 'b');
  assert.equal(decision.phase, 'explore');
});

test('optimizer ignores unrelated campaigns and failure attempts', () => {
  const rows = summarizeVariantResults([
    { experiment: 'campaign', variant: 'a', status: 'sent' },
    { experiment: 'campaign', variant: 'a', status: 'send_failed' },
    { experiment: 'other', variant: 'a', status: 'sent' },
    { experiment: 'campaign', variant: 'a', status: 'replied' },
  ], { campaignId: 'campaign', variants: ['a', 'b'] });
  assert.deepEqual(rows[0], {
    variant: 'a', attempts: 1, replies: 1, closed: 0, failures: 1, replyRate: 1,
  });
});

test('optimizer selects a winner only after bounded evidence thresholds', () => {
  const entries = [];
  for (let index = 0; index < 8; index += 1) {
    entries.push({ experiment: 'campaign', variant: 'a', status: 'sent' });
    entries.push({ experiment: 'campaign', variant: 'b', status: 'sent' });
  }
  entries.push({ experiment: 'campaign', variant: 'a', status: 'replied' });
  entries.push({ experiment: 'campaign', variant: 'a', status: 'replied' });

  const decision = chooseExperimentVariant(entries, {
    campaignId: 'campaign', variants: ['a', 'b'], minSampleSize: 8, minimumReplies: 2,
  });
  assert.equal(decision.variant, 'a');
  assert.equal(decision.phase, 'exploit');
  assert.equal(decision.winner, 'a');
});

test('optimizer keeps learning when reply evidence is tied or sparse', () => {
  const entries = [];
  for (let index = 0; index < 8; index += 1) {
    entries.push({ experiment: 'campaign', variant: 'a', status: 'sent' });
    entries.push({ experiment: 'campaign', variant: 'b', status: 'sent' });
  }
  const decision = chooseExperimentVariant(entries, {
    campaignId: 'campaign', variants: ['a', 'b'], minSampleSize: 8,
  });
  assert.equal(decision.phase, 'learn');
});

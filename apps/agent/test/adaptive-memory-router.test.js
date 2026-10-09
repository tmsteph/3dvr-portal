'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  AdaptiveMemoryRouter,
  classifyStimulus,
  classifyEffect,
} = require('../thomas-agent/node/adaptive-memory-router');

test('maps causal input and external effects onto six trunks', () => {
  assert.equal(classifyStimulus({ text: 'hello' }), 'HEAR');
  assert.equal(classifyStimulus({ text: 'result', toolResult: true }), 'SEE');
  assert.equal(classifyStimulus({ text: 'later', notification: true }), 'NOTICE');
  assert.equal(classifyEffect({ communicates: true }), 'SPEAK');
  assert.equal(classifyEffect({}), 'LOOK');
  assert.equal(classifyEffect({ mutates: true }), 'DO');
});

test('canonical records are append-only and corrections supersede instead of overwrite', () => {
  const memory = new AdaptiveMemoryRouter();
  const first = memory.ingest({ text: 'Esai meeting is Tuesday', source: 'calendar' });
  const correction = memory.ingest({ text: 'Esai meeting is Wednesday', source: 'calendar', supersedes: first.id });
  assert.equal(memory.records.length, 2);
  assert.equal(memory.recordById.get(first.id).text, 'Esai meeting is Tuesday');
  assert.equal(memory.currentRecord(first.id).id, correction.id);
  const recalled = memory.recall('Esai meeting');
  assert.ok(recalled.records.some(record => record.id === correction.id));
  assert.ok(!recalled.records.some(record => record.id === first.id));
});

test('direct factual lane remains present alongside associative expansion', () => {
  const memory = new AdaptiveMemoryRouter();
  const exact = memory.ingest({ text: 'Project Atlas deploys on port 8443', source: 'server' });
  memory.ingest({ text: 'Project Atlas uses the operator gateway', source: 'docs' });
  memory.ingest({ text: 'Operator gateway can inspect deployments', source: 'docs' });
  const recalled = memory.recall('Atlas port 8443', { directLimit: 1, associativeLimit: 2 });
  assert.equal(recalled.direct[0].record.id, exact.id);
  assert.equal(recalled.records[0].id, exact.id);
});

test('unverified outcomes cannot teach the router', () => {
  const memory = new AdaptiveMemoryRouter({ learningRate: 1 });
  memory.registerTool({ name: 'github', description: 'inspect code repositories', keywords: ['repo', 'code'] });
  const before = memory.frontierWeights()[0].weight;
  const result = memory.recordOutcome({ toolName: 'github', success: true });
  const after = memory.frontierWeights()[0].weight;
  assert.equal(result.reinforced, false);
  assert.equal(after, before);
});

test('verified success changes future tool preference while conserving total weight', () => {
  const memory = new AdaptiveMemoryRouter({ learningRate: 1.4, temperature: 0.9 });
  memory.registerTool({ name: 'github', description: 'read and edit repositories', keywords: ['repo', 'code', 'pull request'] });
  memory.registerTool({ name: 'gmail', description: 'read and send email', keywords: ['mail', 'email', 'inbox'] });
  memory.registerTool({ name: 'calendar', description: 'read and schedule events', keywords: ['meeting', 'schedule'] });

  const initial = memory.rankTools('handle this general request');
  assert.ok(Math.abs(initial.reduce((sum, item) => sum + item.probability, 0) - 1) < 1e-12);

  memory.recordOutcome({ toolName: 'gmail', success: true, receiptId: 'gmail-message-001' });
  const learned = memory.rankTools('handle this general request');
  assert.equal(learned[0].tool.name, 'gmail');
  assert.ok(Math.abs(memory.frontierWeights().reduce((sum, item) => sum + item.weight, 0) - 1) < 1e-12);
});

test('semantic relevance can override habit when the task clearly calls for another tool', () => {
  const memory = new AdaptiveMemoryRouter({ learningRate: 1 });
  memory.registerTool({ name: 'github', description: 'repository source code pull request commit', keywords: ['repo', 'github', 'code'] });
  memory.registerTool({ name: 'gmail', description: 'email inbox messages', keywords: ['email', 'mail'] });
  memory.recordOutcome({ toolName: 'gmail', success: true, receiptId: 'mail-success-1' });
  const ranked = memory.rankTools('fix the javascript code in the github repo and open a pull request');
  assert.equal(ranked[0].tool.name, 'github');
});

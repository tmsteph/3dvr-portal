import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  applyMeasurement,
  classifyMilestone,
  createLearningLedger
} from '../src/money-printer/learningLedger.js';
import { updateLearningLedger } from '../src/money-printer/learningRuntime.js';

test('treats founder and friend dollars as tests, not stranger validation', () => {
  assert.equal(classifyMilestone({ founder_customers: 1, founder_revenue_cents: 100 }), 'founder-dollar');
  assert.equal(classifyMilestone({ friend_customers: 1, friend_revenue_cents: 100 }), 'friend-dollar');
  assert.equal(classifyMilestone({ stranger_customers: 1, stranger_revenue_cents: 100 }), 'stranger-dollar');
});

test('requires ten unrelated customers for repeatable demand', () => {
  assert.equal(classifyMilestone({ stranger_customers: 9, stranger_revenue_cents: 900 }), 'stranger-dollar');
  assert.equal(classifyMilestone({ stranger_customers: 10, stranger_revenue_cents: 1000 }), 'repeatable-demand');
});

test('tracks economics separately from demand validation', () => {
  const first = applyMeasurement(createLearningLedger(), {
    signals: {
      stranger_customers: 1,
      stranger_revenue_cents: 100,
      revenue_cents: 100,
      agent_cost_cents: 75
    }
  });
  assert.equal(first.ledger.progress.milestone, 'stranger-dollar');
  assert.equal(first.ledger.progress.economics.self_sustaining, true);
  assert.equal(first.ledger.progress.economics.net_cents, 25);
  assert.equal(first.ledger.progress.autonomy.level, 2);
});

test('repeatable demand keeps level two autonomy until economics earn level three', () => {
  const result = applyMeasurement(createLearningLedger(), {
    signals: {
      stranger_customers: 10,
      stranger_revenue_cents: 1000,
      revenue_cents: 1000
    }
  });
  assert.equal(result.ledger.progress.milestone, 'repeatable-demand');
  assert.equal(result.ledger.progress.autonomy.level, 2);
  assert.equal(result.ledger.progress.economics.self_sustaining, false);
});

test('empty wake cycles become evidence and trigger adaptation', () => {
  let ledger = createLearningLedger();
  for (let cycle = 0; cycle < 3; cycle += 1) {
    ledger = applyMeasurement(ledger, {
      source: 'daemon',
      record_observation: true,
      note: `wake ${cycle + 1}`
    }).ledger;
  }
  assert.equal(ledger.progress.stalled_cycles, 3);
  assert.equal(ledger.decision.should_adapt, true);
  assert.equal(ledger.decision.change_dimension, 'distribution');
  assert.equal(ledger.outcomes.length, 3);
});

test('qualified leads reset the stall counter when they are the active success metric', () => {
  let ledger = createLearningLedger();
  ledger = applyMeasurement(ledger, { record_observation: true }).ledger;
  ledger = applyMeasurement(ledger, { record_observation: true }).ledger;
  assert.equal(ledger.progress.stalled_cycles, 2);
  ledger = applyMeasurement(ledger, {
    signals: { visits: 20, qualified_leads: 1 },
    record_observation: true
  }).ledger;
  assert.equal(ledger.progress.stalled_cycles, 0);
  assert.equal(ledger.decision.should_adapt, false);
});

test('qualified interest with no customers changes the offer, not everything', () => {
  let ledger = createLearningLedger();
  ledger = applyMeasurement(ledger, {
    signals: { visits: 50, qualified_leads: 4 },
    record_observation: true
  }).ledger;
  ledger = applyMeasurement(ledger, { record_observation: true }).ledger;
  ledger = applyMeasurement(ledger, { record_observation: true }).ledger;
  ledger = applyMeasurement(ledger, { record_observation: true }).ledger;
  assert.equal(ledger.decision.change_dimension, 'offer');
  assert.match(ledger.decision.one_variable_rule, /one meaningful variable/i);
});

test('budget exhaustion forces a cost experiment', () => {
  const result = applyMeasurement(createLearningLedger(), {
    signals: { agent_cost_cents: 15000 },
    record_observation: true
  });
  assert.equal(result.ledger.progress.economics.budget_exhausted, true);
  assert.equal(result.ledger.decision.change_dimension, 'cost');
});

test('runtime persists wake cycles so learning survives process restarts', async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'money-learning-loop-'));
  const first = await updateLearningLedger({
    rootDir,
    measurement: { source: 'test-daemon' },
    recordObservation: true
  });
  const second = await updateLearningLedger({
    rootDir,
    measurement: { source: 'test-daemon' },
    recordObservation: true
  });
  const persisted = JSON.parse(await readFile(second.ledgerPath, 'utf8'));
  assert.equal(first.summary.stalledCycles, 1);
  assert.equal(second.summary.stalledCycles, 2);
  assert.equal(persisted.outcomes.length, 2);
});

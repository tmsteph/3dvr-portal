import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { applyEvidence, applyMeasurement, createLearningLedger, rankBacklog } from '../src/money-printer/learningLedger.js';
import { updateLearningLedger } from '../scripts/money-printer-learning.mjs';

test('ranks low-risk, high-confidence experiments first', () => {
  const ranked = rankBacklog([{ id: 'slow', confidence: 0.9, effort: 4, risk: 'GREEN' }, { id: 'fast', confidence: 0.8, effort: 1, risk: 'GREEN' }, { id: 'risky', confidence: 1, effort: 1, risk: 'RED' }]);
  assert.deepEqual(ranked.map(item => item.id), ['fast', 'slow', 'risky']);
});

test('records only material signal changes as outcomes', () => {
  const ledger = createLearningLedger();
  assert.equal(applyMeasurement(ledger, {}).changed, false);
  const result = applyMeasurement(ledger, { observed_at: '2026-07-12T00:00:00.000Z', source: 'analytics-import', signals: { visits: 20, qualified_leads: 2 } });
  assert.equal(result.changed, true);
  assert.equal(result.ledger.outcomes.length, 1);
  assert.equal(result.outcome.delta.visits, 20);
});

test('initializes once and becomes a no-op without new measurements', async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'money-learning-'));
  await mkdir(path.join(rootDir, 'docs'));
  const first = await updateLearningLedger({ rootDir });
  const firstBody = await readFile(first.ledgerPath, 'utf8');
  const second = await updateLearningLedger({ rootDir });
  assert.equal(first.changed, true);
  assert.equal(second.changed, false);
  assert.equal(await readFile(second.ledgerPath, 'utf8'), firstBody);
});

test('imports a measurement file into persistent outcome history', async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'money-learning-'));
  await mkdir(path.join(rootDir, 'docs'));
  await updateLearningLedger({ rootDir });
  await writeFile(path.join(rootDir, 'measurement.json'), JSON.stringify({ observed_at: '2026-07-12T01:00:00.000Z', source: 'test', signals: { visits: 10, signups: 1 } }));
  const result = await updateLearningLedger({ rootDir, measurementPath: 'measurement.json' });
  assert.equal(result.changed, true);
  assert.equal(result.ledger.outcomes[0].signals.signups, 1);
});

test('persists each research run once and promotes its opportunity into the backlog', () => {
  const ledger = createLearningLedger();
  const evidence = {
    signals: {},
    sources: { research: { available: true, run_id: 'pulse-1' } },
    research: { latest_run_id: 'pulse-1', fingerprint: 'same-finding', fit_score: 82 },
    experiment: { id: 'market-lead-rescue', title: 'Lead rescue', confidence: 0.82, effort: 2, risk: 'GREEN', status: 'research' }
  };
  const first = applyEvidence(ledger, evidence);
  const second = applyEvidence(first.ledger, evidence);
  const newRunSameFinding = applyEvidence(first.ledger, {
    ...evidence,
    research: { ...evidence.research, latest_run_id: 'pulse-2' },
    sources: { research: { available: true, run_id: 'pulse-2' } }
  });
  assert.equal(first.changed, true);
  assert.equal(first.researchChanged, true);
  assert.equal(first.ledger.backlog.some(item => item.id === 'market-lead-rescue'), true);
  assert.equal(second.changed, false);
  assert.equal(newRunSameFinding.changed, false);
});

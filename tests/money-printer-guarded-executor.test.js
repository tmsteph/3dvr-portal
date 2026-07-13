import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { executeGuardedImprovement, selectGuardedImprovement } from '../src/money-printer/guardedExecutor.js';
import { createLearningLedger } from '../src/money-printer/learningLedger.js';

function ledgerWithResearch() {
  const ledger = createLearningLedger();
  return {
    ...ledger,
    sources: { analytics: { available: false } },
    research: {
      latest_run_id: 'pulse-1',
      observed_at: '2026-07-12T17:28:02.917Z',
      fingerprint: 'finding-1',
      market: 'owner-led service businesses',
      signals_analyzed: 11,
      fit_score: 82,
      verdict: 'strong signal',
      strongest_channel: 'Hacker News'
    },
    backlog: [
      ...ledger.backlog,
      {
        id: 'market-intake-automation',
        title: 'Customer intake automation',
        hypothesis: 'Faster follow-up will rescue qualified leads.',
        metric: 'qualified_replies',
        confidence: 0.82,
        effort: 2,
        risk: 'GREEN',
        status: 'research',
        evidence_run_id: 'pulse-1',
        score: 0.41
      }
    ]
  };
}

test('skips a blocked baseline and selects one evidence-backed GREEN experiment', () => {
  const selected = selectGuardedImprovement(ledgerWithResearch());
  assert.equal(selected.experiment.id, 'market-intake-automation');
  assert.equal(selected.action, 'prepare-validation-brief');
  assert.deepEqual(selected.skipped[0], {
    experiment_id: 'free-page-conversion-baseline',
    reason: 'analytics baseline unavailable'
  });
});

test('writes one bounded artifact and records the execution durably', async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'guarded-executor-'));
  const ledgerPath = path.join(rootDir, 'docs', 'money-printer-learning-ledger.json');
  const result = await executeGuardedImprovement({ rootDir, ledgerPath, ledger: ledgerWithResearch() });
  const artifact = await readFile(path.join(rootDir, result.artifactPath), 'utf8');

  assert.equal(result.changed, true);
  assert.match(artifact, /Customer intake automation/);
  assert.match(artifact, /Keep this artifact internal/);
  assert.equal(result.ledger.executions.length, 1);
  assert.equal(result.ledger.backlog.find(item => item.id === 'market-intake-automation').status, 'prepared');
  assert.equal(selectGuardedImprovement(result.ledger).experiment, null);
});

test('records a Free Page baseline only when analytics has real visits', () => {
  const ledger = createLearningLedger();
  ledger.sources = { analytics: { available: true, run_id: 'analytics-1' } };
  ledger.current_signals = { ...ledger.current_signals, visits: 20, qualified_leads: 2 };
  const selected = selectGuardedImprovement(ledger);

  assert.equal(selected.experiment.id, 'free-page-conversion-baseline');
  assert.equal(selected.action, 'record-conversion-baseline');
  assert.match(selected.markdown, /10\.0%/);
});

test('never executes YELLOW findings', () => {
  const ledger = createLearningLedger();
  ledger.backlog = [{ id: 'copy-change', risk: 'YELLOW', status: 'ready', score: 1 }];
  const selected = selectGuardedImprovement(ledger);
  assert.equal(selected.experiment, null);
  assert.match(selected.skipped[0].reason, /approval required/);
});

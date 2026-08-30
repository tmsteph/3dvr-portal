import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  attachCycleLearning,
  buildCycleEvidence
} from '../scripts/money-printer-auto-business.mjs';
import { runMoneyPrinterDaemonCycle } from '../src/money-printer/moneyPrinterDaemon.js';
import { updateLearningLedger } from '../src/money-printer/learningRuntime.js';

test('full business evidence is cumulative and preserves prior progress', () => {
  const evidence = buildCycleEvidence({
    generatedAt: '2026-08-30T15:00:00Z',
    outreach: { sent: 2 },
    autopilot: {
      runId: 'money-auto-1',
      analytics: { enabled: true, sessions: 4 },
      revenue: {
        enabled: true,
        monthlyRecurringRevenueCents: 500,
        byOffer: [{ offer: 'audit', paidCheckouts: 1, grossRevenueCents: 100 }]
      }
    },
    marketPulse: {
      runId: 'market-pulse-auto-1',
      generatedAt: '2026-08-30T15:00:00Z',
      market: 'AV freelancers',
      signalsAnalyzed: 6,
      marketFit: { score: 72 },
      topOpportunity: { title: 'Schedule rescue', problem: 'Freelancers miss work.' }
    },
    critique: { nextMoneyMove: 'Test the schedule rescue offer.' }
  }, {
    visits: 10,
    outreach_sent: 5,
    customers: 3,
    revenue_cents: 900
  });

  assert.equal(evidence.source, 'auto-business-cycle');
  assert.equal(evidence.signals.visits, 10);
  assert.equal(evidence.signals.outreach_sent, 7);
  assert.equal(evidence.signals.customers, 3);
  assert.equal(evidence.signals.revenue_cents, 900);
  assert.equal(evidence.signals.stripe_attributed_revenue_cents, 100);
  assert.equal(evidence.research.latest_run_id, 'market-pulse-auto-1');
});

test('one full auto-business cycle creates one learning observation', async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'auto-business-learning-'));
  try {
    const report = {
      generatedAt: '2026-08-30T15:00:00Z',
      outreach: { sent: 1 },
      autopilot: { runId: 'money-auto-2' },
      marketPulse: null,
      critique: { nextMoneyMove: 'Try one narrower message.' }
    };

    const result = await attachCycleLearning(rootDir, report);
    const persisted = JSON.parse(await readFile(result.ledgerPath, 'utf8'));
    assert.equal(persisted.outcomes.length, 1);
    assert.equal(persisted.current_signals.outreach_sent, 1);
    assert.equal(report.learning.stalledCycles, 1);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('nested daemon can defer its wake so enclosing business cycle owns the observation', async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'money-daemon-defer-'));
  try {
    await updateLearningLedger({ rootDir });
    const result = await runMoneyPrinterDaemonCycle({
      rootDir,
      ai: false,
      deferLearningObservation: true,
      env: {}
    });
    const persisted = JSON.parse(await readFile(result.learning.ledgerPath, 'utf8'));
    assert.equal(result.report.learningObservationDeferred, true);
    assert.equal(persisted.outcomes.length, 0);
    assert.equal(persisted.progress.stalled_cycles, 0);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

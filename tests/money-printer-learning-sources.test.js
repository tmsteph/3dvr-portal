import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  classifyRevenueProvenance,
  collectLearningEvidence,
  deriveEvidence,
  parseCsv,
  parseEmbeddedJson
} from '../src/money-printer/learningSources.js';

test('parses JSON after npm and runtime chatter', () => {
  const parsed = parseEmbeddedJson('> npm run research\nhello\n{"runId":"market-pulse-1","signalsAnalyzed":4}\n');
  assert.equal(parsed.runId, 'market-pulse-1');
});

test('parses quoted CSV including embedded commas and newlines', () => {
  const rows = parseCsv('id,replyStatus,notes\na,qualified,"useful, specific"\nb,,"two\nlines"\n');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].notes, 'useful, specific');
  assert.equal(rows[1].notes, 'two\nlines');
});

test('derives measured signals and a guarded research experiment', () => {
  const evidence = deriveEvidence({
    autopilot: { runId: 'money-1', generatedAt: '2026-07-13T00:00:00Z', analytics: { enabled: true, sessions: 42 } },
    outbound: { generatedAt: '2026-07-13T01:00:00Z', autopilotRunId: 'money-2', dispatch: { sentCount: 1 }, queue: [] },
    outcomes: [{ replyStatus: 'qualified', subscriptionStatus: 'active', revenue: '$5.00' }],
    marketPulse: { runId: 'market-pulse-1', generatedAt: '2026-07-13T02:00:00Z', market: 'local services', signalsAnalyzed: 11, marketFit: { score: 82, verdict: 'strong signal', strongestChannel: 'Hacker News', nextAction: 'Interview three buyers.' }, topOpportunity: { title: 'Lead follow-up rescue', problem: 'Leads go cold.' } }
  });
  assert.equal(evidence.signals.visits, 42);
  assert.equal(evidence.signals.outreach_sent, 1);
  assert.equal(evidence.signals.qualified_replies, 1);
  assert.equal(evidence.signals.customers, 1);
  assert.equal(evidence.signals.revenue_cents, 500);
  assert.equal(evidence.experiment.risk, 'GREEN');
  assert.equal(evidence.research.fit_score, 82);
  assert.match(evidence.research.fingerprint, /^fnv1a-/);
});

test('only explicit relationship metadata counts toward founder friend or stranger milestones', () => {
  const evidence = deriveEvidence({
    outcomes: [
      { id: 'founder-1', relationship: 'founder', subscriptionStatus: 'active', revenue: '$1.00' },
      { id: 'friend-1', customer_relationship: 'friend', subscriptionStatus: 'active', revenue: '$2.00' },
      { id: 'stranger-1', revenue_provenance: 'stranger', subscriptionStatus: 'active', revenue: '$3.00' },
      { id: 'unknown-1', source: 'reddit', subscriptionStatus: 'active', revenue: '$4.00' }
    ]
  });

  assert.equal(classifyRevenueProvenance({ relationship: 'founder' }), 'founder');
  assert.equal(classifyRevenueProvenance({ source: 'reddit' }), 'unattributed');
  assert.equal(evidence.signals.founder_customers, 1);
  assert.equal(evidence.signals.friend_customers, 1);
  assert.equal(evidence.signals.stranger_customers, 1);
  assert.equal(evidence.signals.founder_revenue_cents, 100);
  assert.equal(evidence.signals.friend_revenue_cents, 200);
  assert.equal(evidence.signals.stranger_revenue_cents, 300);
  assert.equal(evidence.signals.revenue_cents, 1000);
  assert.equal(evidence.sources.revenue.provenance_rows.unattributed, 1);
});

test('derives Stripe-attributed revenue without treating unrelated Stripe payments as offer evidence', () => {
  const evidence = deriveEvidence({
    outbound: {
      generatedAt: '2026-08-28T00:00:00Z',
      autopilotRunId: 'money-paid-1',
      dispatch: { sentCount: 2 },
      queue: [],
      revenue: {
        enabled: true,
        grossRevenueCents: 50000,
        monthlyRecurringRevenueCents: 2500,
        byOffer: [
          { offer: 'website-upgrade', paidCheckouts: 2, grossRevenueCents: 19800 }
        ]
      }
    },
    outcomes: []
  });

  assert.equal(evidence.signals.stripe_attributed_checkouts, 2);
  assert.equal(evidence.signals.stripe_attributed_revenue_cents, 19800);
  assert.equal(evidence.signals.stripe_mrr_cents, 2500);
  assert.notEqual(evidence.signals.stripe_attributed_revenue_cents, 50000);
  assert.equal(evidence.signals.stranger_revenue_cents, 0);
  assert.equal(evidence.sources.revenue.available, true);
  assert.match(evidence.sources.revenue.reason, /Stripe attributed revenue/);
});

test('collects the latest workflow evidence from artifact directories', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'money-evidence-'));
  await mkdir(path.join(root, 'autopilot'), { recursive: true });
  await mkdir(path.join(root, 'outbound'), { recursive: true });
  await mkdir(path.join(root, 'pulse'), { recursive: true });
  await writeFile(path.join(root, 'autopilot', 'latest.json'), JSON.stringify({ runId: 'money-1', analytics: { enabled: false } }));
  await writeFile(path.join(root, 'outbound', 'latest.json'), JSON.stringify({ generatedAt: '2026-07-13T01:00:00Z', autopilotRunId: 'money-2', dispatch: { sentCount: 0 }, queue: [] }));
  await writeFile(path.join(root, 'outbound', 'outcome-tracker.csv'), 'id,replyStatus,revenue\na,qualified,5\n');
  await writeFile(path.join(root, 'pulse', 'latest.json'), `npm chatter\n${JSON.stringify({ runId: 'market-pulse-2', signalsAnalyzed: 3, marketFit: { score: 70 }, topOpportunity: { title: 'Fast intake' } })}`);
  const evidence = await collectLearningEvidence(root);
  assert.equal(evidence.research.latest_run_id, 'market-pulse-2');
  assert.equal(evidence.signals.qualified_replies, 1);
  assert.equal(evidence.signals.revenue_cents, 500);
  assert.equal(evidence.sources.analytics.available, false);
});

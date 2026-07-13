import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { collectLearningEvidence, deriveEvidence, parseCsv, parseEmbeddedJson } from '../src/money-printer/learningSources.js';

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

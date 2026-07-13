import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const EXECUTABLE_STATUSES = new Set(['ready', 'research']);
const MAX_EXECUTIONS = 50;

function cleanText(value = '', fallback = '') {
  return String(value || fallback).replace(/\s+/g, ' ').trim().slice(0, 500);
}

function safeId(value = '') {
  return String(value).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 96);
}

function percent(numerator, denominator) {
  if (!denominator) return '0.0%';
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function executionKey(experiment, ledger) {
  if (experiment.id === 'free-page-conversion-baseline') {
    const signals = ledger.current_signals || {};
    return `${experiment.id}:${signals.visits || 0}:${signals.qualified_leads || 0}`;
  }
  return `${experiment.id}:${ledger.research?.fingerprint || experiment.evidence_run_id || 'no-evidence'}`;
}

function baselineCandidate(experiment, ledger) {
  const visits = Number(ledger.current_signals?.visits || 0);
  if (!ledger.sources?.analytics?.available || visits <= 0) {
    return { blocked: 'analytics baseline unavailable' };
  }
  const leads = Number(ledger.current_signals?.qualified_leads || 0);
  return {
    action: 'record-conversion-baseline',
    observedAt: ledger.outcomes?.at(-1)?.observed_at || new Date().toISOString(),
    markdown: `# ${cleanText(experiment.title)}

## Measured baseline

- Visits: ${visits}
- Qualified leads: ${leads}
- Visit-to-qualified-lead rate: ${percent(leads, visits)}
- Source: ${cleanText(ledger.sources.analytics.run_id, 'analytics import')}

## Decision rule

Use this as the control for the next proof-focused Free Page test. Do not ship a copy variant unless it names the same primary metric and can be rolled back independently.
`
  };
}

function researchCandidate(experiment, ledger) {
  const research = ledger.research || {};
  const matchesEvidence = experiment.evidence_run_id
    && experiment.evidence_run_id === research.latest_run_id;
  if (!matchesEvidence) return { blocked: 'matching research evidence unavailable' };
  return {
    action: 'prepare-validation-brief',
    observedAt: research.observed_at || new Date().toISOString(),
    markdown: `# ${cleanText(experiment.title)}

## Hypothesis

${cleanText(experiment.hypothesis, 'The market evidence supports a narrow validation test.')}

## Evidence

- Market: ${cleanText(research.market, 'not specified')}
- Signals analyzed: ${Number(research.signals_analyzed || 0)}
- Fit score: ${Number(research.fit_score || 0)}/100
- Verdict: ${cleanText(research.verdict, 'unrated')}
- Strongest channel: ${cleanText(research.strongest_channel, 'not specified')}
- Evidence run: ${cleanText(research.latest_run_id, 'not specified')}

## Bounded next experiment

Create one internal offer prototype that addresses this problem: ${cleanText(research.opportunity?.problem, experiment.hypothesis)} Validate the language with reaction snapshots before any prospect outreach, pricing, deployment, or billing change.

## Success metric

Primary metric: ${cleanText(experiment.metric, 'qualified_replies')}. Keep this artifact internal until a human approves any external probe.
`
  };
}

function buildCandidate(experiment, ledger) {
  if (experiment.id === 'free-page-conversion-baseline') {
    return baselineCandidate(experiment, ledger);
  }
  if (experiment.status === 'research') {
    return researchCandidate(experiment, ledger);
  }
  return { blocked: 'no bounded executor is registered for this experiment' };
}

export function selectGuardedImprovement(ledger = {}) {
  const completed = new Set((ledger.executions || []).map(item => item.execution_key));
  const skipped = [];
  for (const experiment of ledger.backlog || []) {
    if (experiment.risk !== 'GREEN') {
      skipped.push({ experiment_id: experiment.id, reason: 'approval required for non-GREEN experiment' });
      continue;
    }
    if (!EXECUTABLE_STATUSES.has(experiment.status)) continue;
    const execution_key = executionKey(experiment, ledger);
    if (completed.has(execution_key)) continue;
    const candidate = buildCandidate(experiment, ledger);
    if (candidate.blocked) {
      skipped.push({ experiment_id: experiment.id, reason: candidate.blocked });
      continue;
    }
    return { experiment, execution_key, skipped, ...candidate };
  }
  return { experiment: null, skipped };
}

export async function executeGuardedImprovement({ rootDir, ledger, ledgerPath, write = true } = {}) {
  const selected = selectGuardedImprovement(ledger);
  if (!selected.experiment) {
    return { changed: false, reason: 'no executable GREEN improvement', skipped: selected.skipped, ledger };
  }

  const experimentId = safeId(selected.experiment.id);
  const artifactPath = `docs/money-printer-experiments/${experimentId}.md`;
  const execution = {
    execution_key: selected.execution_key,
    experiment_id: selected.experiment.id,
    action: selected.action,
    artifact_path: artifactPath,
    executed_at: selected.observedAt
  };
  const nextLedger = {
    ...ledger,
    schema_version: Math.max(2, Number(ledger.schema_version || 1)),
    backlog: (ledger.backlog || []).map(item => item.id === selected.experiment.id
      ? { ...item, status: 'prepared' }
      : item),
    executions: [...(ledger.executions || []), execution].slice(-MAX_EXECUTIONS),
    decision: {
      experiment_id: selected.experiment.id,
      reason: `Executed one bounded GREEN action: ${selected.action}.`
    }
  };

  if (write) {
    const absoluteArtifactPath = path.join(rootDir, artifactPath);
    await mkdir(path.dirname(absoluteArtifactPath), { recursive: true });
    await writeFile(absoluteArtifactPath, selected.markdown, 'utf8');
    await writeFile(ledgerPath, `${JSON.stringify(nextLedger, null, 2)}\n`, 'utf8');
  }

  return {
    changed: true,
    reason: `prepared ${selected.action} for ${selected.experiment.id}`,
    artifactPath,
    changedPaths: [path.relative(rootDir, ledgerPath), artifactPath],
    execution,
    skipped: selected.skipped,
    ledger: nextLedger
  };
}

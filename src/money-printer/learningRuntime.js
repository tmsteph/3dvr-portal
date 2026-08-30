import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { applyEvidence, applyMeasurement, createLearningLedger } from './learningLedger.js';
import { collectLearningEvidence } from './learningSources.js';

export const DEFAULT_LEDGER_PATH = 'docs/money-printer-learning-ledger.json';

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return fallback;
    throw error;
  }
}

export function summarizeLearningLedger(ledger = createLearningLedger()) {
  const progress = ledger.progress || {};
  const economics = progress.economics || {};
  return {
    milestone: progress.milestone || 'pre-revenue',
    strangerCustomers: Number(progress.stranger_customers || 0),
    strangerCustomerGoal: Number(progress.stranger_customer_goal || 10),
    stalledCycles: Number(progress.stalled_cycles || 0),
    selfSustaining: Boolean(economics.self_sustaining),
    netCents: Number(economics.net_cents || 0),
    autonomyLevel: Number(progress.autonomy?.level || 0),
    autonomyLabel: progress.autonomy?.label || 'observe',
    nextExperiment: ledger.decision || null
  };
}

export async function updateLearningLedger({
  rootDir = process.cwd(),
  measurementPath = '',
  evidenceDir = '',
  measurement = null,
  evidence = null,
  recordObservation = false
} = {}) {
  const ledgerPath = path.join(rootDir, DEFAULT_LEDGER_PATH);
  const existing = await readJson(ledgerPath, null);
  const ledger = existing || createLearningLedger();
  const importedEvidence = evidence || (evidenceDir
    ? await collectLearningEvidence(path.resolve(rootDir, evidenceDir))
    : null);
  const importedMeasurement = measurement || (measurementPath
    ? await readJson(path.resolve(rootDir, measurementPath), {})
    : null);

  const result = importedEvidence
    ? applyEvidence(ledger, importedEvidence, { recordObservation })
    : applyMeasurement(ledger, importedMeasurement || {}, { recordObservation });
  const changed = !existing || result.changed;

  if (changed) {
    await mkdir(path.dirname(ledgerPath), { recursive: true });
    await writeFile(ledgerPath, `${JSON.stringify(result.ledger, null, 2)}\n`, 'utf8');
  }

  const reason = !existing
    ? 'initialized experiment memory'
    : result.researchChanged
      ? 'recorded new market research'
      : result.observationRecorded && !result.signalsChanged
        ? 'recorded wake cycle with no new measured signal'
        : result.changed
          ? 'recorded new operating evidence'
          : 'no new measured signal';

  return {
    changed,
    reason,
    ledgerPath,
    ledger: result.ledger,
    summary: summarizeLearningLedger(result.ledger),
    outcome: result.outcome || null,
    researchChanged: Boolean(result.researchChanged),
    evidence: importedEvidence
  };
}

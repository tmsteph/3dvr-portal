#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { applyEvidence, applyMeasurement, createLearningLedger } from '../src/money-printer/learningLedger.js';
import { collectLearningEvidence } from '../src/money-printer/learningSources.js';

export const DEFAULT_LEDGER_PATH = 'docs/money-printer-learning-ledger.json';

async function readJson(filePath, fallback) {
  try { return JSON.parse(await readFile(filePath, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
}

export async function updateLearningLedger({ rootDir = process.cwd(), measurementPath = '', evidenceDir = '' } = {}) {
  const ledgerPath = path.join(rootDir, DEFAULT_LEDGER_PATH);
  const existing = await readJson(ledgerPath, null);
  const ledger = existing || createLearningLedger();
  const importedEvidence = evidenceDir ? await collectLearningEvidence(path.resolve(rootDir, evidenceDir)) : null;
  const measurement = measurementPath ? await readJson(path.resolve(rootDir, measurementPath), {}) : null;
  const result = importedEvidence ? applyEvidence(ledger, importedEvidence) : applyMeasurement(ledger, measurement || {});
  const changed = !existing || result.changed;
  if (changed) await writeFile(ledgerPath, `${JSON.stringify(result.ledger, null, 2)}\n`, 'utf8');
  const reason = !existing
    ? 'initialized experiment memory'
    : result.researchChanged ? 'recorded new market research'
      : result.changed ? 'recorded new operating evidence' : 'no new measured signal';
  return { changed, reason, ledgerPath, ledger: result.ledger, outcome: result.outcome || null, researchChanged: Boolean(result.researchChanged), evidence: importedEvidence };
}

async function main() {
  const index = process.argv.indexOf('--measurement-file');
  const evidenceIndex = process.argv.indexOf('--evidence-dir');
  const result = await updateLearningLedger({ measurementPath: index >= 0 ? process.argv[index + 1] : '', evidenceDir: evidenceIndex >= 0 ? process.argv[evidenceIndex + 1] : '' });
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(error => { console.error(`money-printer-learning: ${error.message}`); process.exitCode = 1; });

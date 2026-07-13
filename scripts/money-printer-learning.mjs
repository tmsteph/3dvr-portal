#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { applyMeasurement, createLearningLedger } from '../src/money-printer/learningLedger.js';

export const DEFAULT_LEDGER_PATH = 'docs/money-printer-learning-ledger.json';

async function readJson(filePath, fallback) {
  try { return JSON.parse(await readFile(filePath, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
}

export async function updateLearningLedger({ rootDir = process.cwd(), measurementPath = '' } = {}) {
  const ledgerPath = path.join(rootDir, DEFAULT_LEDGER_PATH);
  const existing = await readJson(ledgerPath, null);
  const ledger = existing || createLearningLedger();
  const measurement = measurementPath ? await readJson(path.resolve(rootDir, measurementPath), {}) : {};
  const result = applyMeasurement(ledger, measurement);
  const changed = !existing || result.changed;
  if (changed) await writeFile(ledgerPath, `${JSON.stringify(result.ledger, null, 2)}\n`, 'utf8');
  return { changed, reason: !existing ? 'initialized experiment memory' : result.changed ? 'recorded new measured signals' : 'no new measured signal', ledgerPath, ledger: result.ledger, outcome: result.outcome || null };
}

async function main() {
  const index = process.argv.indexOf('--measurement-file');
  const result = await updateLearningLedger({ measurementPath: index >= 0 ? process.argv[index + 1] : '' });
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(error => { console.error(`money-printer-learning: ${error.message}`); process.exitCode = 1; });

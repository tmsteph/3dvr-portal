#!/usr/bin/env node

import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { updateLearningLedger, DEFAULT_LEDGER_PATH } from '../src/money-printer/learningRuntime.js';

export { updateLearningLedger, DEFAULT_LEDGER_PATH };

async function main() {
  const measurementIndex = process.argv.indexOf('--measurement-file');
  const evidenceIndex = process.argv.indexOf('--evidence-dir');
  const recordObservation = process.argv.includes('--wake') || process.argv.includes('--record-observation');
  const result = await updateLearningLedger({
    measurementPath: measurementIndex >= 0 ? process.argv[measurementIndex + 1] : '',
    evidenceDir: evidenceIndex >= 0 ? process.argv[evidenceIndex + 1] : '',
    recordObservation
  });
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(`money-printer-learning: ${error.message}`);
    process.exitCode = 1;
  });
}

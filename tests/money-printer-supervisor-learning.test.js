import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { applyMeasurement, createLearningLedger } from '../src/money-printer/learningLedger.js';
import {
  addMoneyPrinterOperations,
  approveMoneyPrinterOperation,
  loadMoneyPrinterOperations
} from '../src/money-printer/moneyPrinterOperations.js';
import { runMoneyPrinterSupervisor } from '../scripts/money-printer-supervisor.mjs';

async function createExhaustedWorkspace(prefix = 'money-supervisor-budget-') {
  const rootDir = await mkdtemp(path.join(tmpdir(), prefix));
  const ledger = applyMeasurement(createLearningLedger(), {
    signals: { agent_cost_cents: 15000 },
    record_observation: true
  }).ledger;
  const docsDir = path.join(rootDir, 'docs');
  await mkdir(docsDir, { recursive: true });
  await writeFile(
    path.join(docsDir, 'money-printer-learning-ledger.json'),
    `${JSON.stringify(ledger, null, 2)}\n`,
    'utf8'
  );

  const added = await addMoneyPrinterOperations(rootDir, [{
    provider: 'github',
    action: 'createIssue',
    title: 'Approved operation must remain blocked',
    summary: 'Budget gate regression test.',
    risk: 'green',
    payload: { title: 'Budget gate regression test', body: 'Do not execute.' }
  }]);
  await approveMoneyPrinterOperation(rootDir, added.added[0].id);
  return { rootDir, operationId: added.added[0].id };
}

function saveRelevantEnv() {
  return {
    MONEY_PRINTER_AUTO_APPROVE_GREEN: process.env.MONEY_PRINTER_AUTO_APPROVE_GREEN,
    MONEY_PRINTER_ALLOW_GITHUB_WRITE: process.env.MONEY_PRINTER_ALLOW_GITHUB_WRITE,
    MONEY_PRINTER_LIVE_CONNECTORS: process.env.MONEY_PRINTER_LIVE_CONNECTORS
  };
}

function restoreEnv(originalEnv) {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function setBlockedTestEnv() {
  process.env.MONEY_PRINTER_AUTO_APPROVE_GREEN = 'true';
  process.env.MONEY_PRINTER_ALLOW_GITHUB_WRITE = 'false';
  process.env.MONEY_PRINTER_LIVE_CONNECTORS = 'false';
}

test('supervisor does not auto-approve or execute operations after learning budget exhaustion', async () => {
  const originalEnv = saveRelevantEnv();
  const { rootDir, operationId } = await createExhaustedWorkspace();
  try {
    setBlockedTestEnv();
    const result = await runMoneyPrinterSupervisor({
      rootDir,
      mock: true,
      autoApproveGreen: true,
      executeApproved: true
    });

    const operations = await loadMoneyPrinterOperations(rootDir);
    const approved = operations.find(operation => operation.id === operationId);
    assert.equal(result.executionBlockedByBudget, true);
    assert.equal(result.autoApprovedCount, 0);
    assert.equal(result.executedApprovedCount, 0);
    assert.equal(result.guardrails.blocksExecutionWhenLearningBudgetExhausted, true);
    assert.equal(approved.status, 'approved');
  } finally {
    restoreEnv(originalEnv);
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('health-only supervisor still reads persisted budget before approval or execution', async () => {
  const originalEnv = saveRelevantEnv();
  const { rootDir, operationId } = await createExhaustedWorkspace('money-health-budget-');
  try {
    setBlockedTestEnv();
    const result = await runMoneyPrinterSupervisor({
      rootDir,
      mock: true,
      healthOnly: true,
      autoApproveGreen: true,
      executeApproved: true
    });

    const operations = await loadMoneyPrinterOperations(rootDir);
    const approved = operations.find(operation => operation.id === operationId);
    assert.equal(result.healthOnly, true);
    assert.equal(result.executionBlockedByBudget, true);
    assert.equal(result.autoApprovedCount, 0);
    assert.equal(result.executedApprovedCount, 0);
    assert.equal(result.learning.milestone, 'pre-revenue');
    assert.equal(approved.status, 'approved');
  } finally {
    restoreEnv(originalEnv);
    await rm(rootDir, { recursive: true, force: true });
  }
});

#!/usr/bin/env node

import { appendFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { detectCodexCli } from '../src/money-printer/moneyPrinterCodexRunner.js';
import {
  appendMoneyPrinterEvent,
  ensureMoneyPrinterWorkspace,
  getMoneyPrinterWorkspacePaths,
  writeJsonFile
} from '../src/money-printer/moneyPrinterFileStorage.js';
import { getModelProviderStatus } from '../src/money-printer/moneyPrinterModelProvider.js';
import {
  executeApprovedMoneyPrinterOperations,
  loadMoneyPrinterOperations
} from '../src/money-printer/moneyPrinterOperations.js';
import { runMoneyPrinterDaemonCycle } from '../src/money-printer/moneyPrinterDaemon.js';
import { readGithubStatus } from '../src/money-printer/moneyPrinterGithubConnector.js';
import { readVercelStatus } from '../src/money-printer/moneyPrinterVercelConnector.js';

function parseArgs(argv = process.argv.slice(2)) {
  const flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) continue;
    const [rawKey, inlineValue] = arg.slice(2).split('=');
    const key = rawKey.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    if (inlineValue !== undefined) {
      flags[key] = inlineValue;
      continue;
    }
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      flags[key] = next;
      index += 1;
    } else {
      flags[key] = true;
    }
  }
  return flags;
}

function parseEnvLine(line = '') {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) return null;
  const splitAt = trimmed.indexOf('=');
  const key = trimmed.slice(0, splitAt).trim();
  let value = trimmed.slice(splitAt + 1).trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return null;
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  return [key, value];
}

async function loadEnvFiles(rootDir = process.cwd()) {
  for (const file of ['.env', '.env.local']) {
    const filePath = path.resolve(rootDir, file);
    if (!existsSync(filePath)) continue;
    const lines = (await readFile(filePath, 'utf8')).split(/\r?\n/);
    for (const line of lines) {
      const entry = parseEnvLine(line);
      if (entry && process.env[entry[0]] === undefined) {
        process.env[entry[0]] = entry[1];
      }
    }
  }
}

function countByStatus(operations = []) {
  return operations.reduce((counts, operation) => {
    const status = operation.status || 'unknown';
    counts[status] = (counts[status] || 0) + 1;
    return counts;
  }, {});
}

function countByRisk(operations = []) {
  return operations.reduce((counts, operation) => {
    const risk = operation.risk || 'unknown';
    counts[risk] = (counts[risk] || 0) + 1;
    return counts;
  }, {});
}

async function appendSupervisorLog(rootDir, summary) {
  const paths = getMoneyPrinterWorkspacePaths(rootDir);
  const logPath = path.join(paths.logsDir, 'supervisor.jsonl');
  await appendFile(logPath, `${JSON.stringify(summary)}\n`, 'utf8');
  return logPath;
}

function printHelp() {
  console.log(`money-printer supervisor

Usage:
  npm run money-printer:supervisor -- --ai
  npm run money-printer:supervisor -- --ai --execute-approved
  npm run money-printer:supervisor -- --health-only --json

Flags:
  --root <dir>           Repository root, defaults to current directory
  --ai                   Use configured AI provider, falling back to mock
  --mock                 Force mock mode
  --execute-approved     Execute locally approved operations if connector env flags allow it
  --health-only          Write/read status without running a daemon cycle
  --json                 Print JSON only
`);
}

export async function runMoneyPrinterSupervisor(options = {}) {
  const rootDir = path.resolve(options.rootDir || process.cwd());
  await loadEnvFiles(rootDir);
  await ensureMoneyPrinterWorkspace(rootDir);

  const ai = options.mock ? false : Boolean(options.ai || process.env.MONEY_PRINTER_SUPERVISOR_AI === 'true');
  const runOptions = {
    rootDir,
    ai,
    mock: Boolean(options.mock),
    execute: false,
    env: process.env
  };

  const startedAt = new Date().toISOString();
  const beforeOperations = await loadMoneyPrinterOperations(rootDir);
  const [providerStatus, codex, github, vercel] = await Promise.all([
    getModelProviderStatus(runOptions, process.env),
    detectCodexCli(),
    readGithubStatus(process.env),
    readVercelStatus(process.env)
  ]);

  const daemon = options.healthOnly
    ? null
    : await runMoneyPrinterDaemonCycle({
      ...runOptions,
      command: 'supervisor-cycle'
    });

  const afterPlanOperations = await loadMoneyPrinterOperations(rootDir);
  const executedOperations = options.executeApproved
    ? await executeApprovedMoneyPrinterOperations(rootDir, {
      ...runOptions,
      execute: true
    })
    : [];
  const finalOperations = await loadMoneyPrinterOperations(rootDir);

  const paths = getMoneyPrinterWorkspacePaths(rootDir);
  const summary = {
    startedAt,
    finishedAt: new Date().toISOString(),
    rootDir,
    mode: providerStatus.mode,
    model: providerStatus.model,
    healthOnly: Boolean(options.healthOnly),
    daemonReportPath: daemon?.reportPath || '',
    eventLogPath: daemon?.eventLogPath || '',
    nextBestMoneyAction: daemon?.report?.nextBestMoneyAction || '',
    codexPromptPath: daemon?.report?.codexPromptPath || '',
    operationsBefore: beforeOperations.length,
    operationsAfterPlanning: afterPlanOperations.length,
    operationsAfterExecution: finalOperations.length,
    operationsAddedThisCycle: Math.max(0, afterPlanOperations.length - beforeOperations.length),
    operationStatusCounts: countByStatus(finalOperations),
    operationRiskCounts: countByRisk(finalOperations),
    executedApprovedCount: executedOperations.length,
    runtime: {
      openAiKeyPresent: providerStatus.openAiKeyPresent,
      liveConnectorsEnabled: providerStatus.liveConnectorsEnabled,
      allowGithubWrite: providerStatus.allowGithubWrite,
      allowVercelWrite: providerStatus.allowVercelWrite,
      allowCodexExec: providerStatus.allowCodexExec,
      codexAvailable: codex.available,
      githubConfigured: github.configured,
      vercelConfigured: vercel.configured
    },
    guardrails: {
      sendsEmail: false,
      movesMoney: false,
      changesDns: false,
      mergesProduction: false,
      executesCodeWithoutExplicitFlag: false,
      executesOnlyApprovedOperations: Boolean(options.executeApproved)
    }
  };

  const latestPath = path.join(paths.reportsDir, 'supervisor-latest.json');
  await writeJsonFile(latestPath, summary);
  const supervisorLogPath = await appendSupervisorLog(rootDir, summary);
  await appendMoneyPrinterEvent(rootDir, {
    command: 'supervisor',
    inputSummary: options.healthOnly ? 'health-only' : 'scheduled cycle',
    outputSummary: `${summary.operationsAddedThisCycle} operation(s) added; ${summary.executedApprovedCount} approved operation(s) executed.`,
    nextAction: summary.nextBestMoneyAction || 'Review supervisor-latest.json and approve or reject planned operations.',
    aiMode: summary.mode,
    model: summary.model
  });

  return {
    ...summary,
    latestPath,
    supervisorLogPath
  };
}

async function main() {
  const flags = parseArgs();
  if (flags.help || flags.h) {
    printHelp();
    return;
  }
  const result = await runMoneyPrinterSupervisor({
    rootDir: flags.root || process.cwd(),
    ai: flags.ai === true,
    mock: flags.mock === true,
    executeApproved: flags.executeApproved === true,
    healthOnly: flags.healthOnly === true
  });

  if (flags.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log('Money Printer Supervisor');
  console.log(`Mode: ${result.mode}${result.model ? ` (${result.model})` : ''}`);
  console.log(`Report: ${path.relative(result.rootDir, result.latestPath)}`);
  if (result.daemonReportPath) {
    console.log(`Cycle report: ${path.relative(result.rootDir, result.daemonReportPath)}`);
  }
  console.log(`Operations added: ${result.operationsAddedThisCycle}`);
  console.log(`Approved operations executed: ${result.executedApprovedCount}`);
  console.log(`Codex prompt: ${result.codexPromptPath ? path.relative(result.rootDir, result.codexPromptPath) : 'not generated'}`);
  console.log(`Next action: ${result.nextBestMoneyAction || 'Review planned operations and recent market signals.'}`);
  console.log('Guardrails: no email sending, money movement, DNS changes, or production merges.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(`money-printer-supervisor: ${error.message}`);
    process.exitCode = 1;
  });
}

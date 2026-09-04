#!/usr/bin/env node

import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import {
  checkAutoBusinessSetup,
  runAutoBusinessCycle
} from '../src/money-printer/autoBusiness.js';
import { deriveEvidence } from '../src/money-printer/learningSources.js';
import { updateLearningLedger } from '../src/money-printer/learningRuntime.js';

function parseArgs(argv = process.argv.slice(2)) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      args[key] = next;
      index += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function parseBool(value) {
  if (typeof value === 'boolean') return value;
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return undefined;
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return undefined;
}

function printHelp() {
  console.log(`3DVR auto-business

Usage:
  npm run money-printer:auto-business
  npm run money-printer:auto-business -- --market "local service businesses" --outreach-enabled true

Flags:
  --root <dir>                 Repository root, defaults to current directory.
  --market <text>              Market for this cycle.
  --keywords <csv>             Keywords for market research.
  --channels <csv>             Channels for market and offer research.
  --dry-run <true|false>       Skip external publishing where supported.
  --outreach-enabled <bool>    Send eligible contacts from AUTO_BUSINESS_CONTACTS_FILE.
  --outreach-mode <mode>       warm or compliant-b2b. Default: warm.
  --outreach-daily-limit <n>   Max outreach sends per day.
  --contacts-file <path>       CSV or JSON contact list.
  --suppression-file <path>    CSV or JSON unsubscribe/suppression list.
  --facebook-queue <bool>      Queue selected-market Facebook Page jobs to Gun.
  --facebook-auto-approve <bool> Mark generated Page jobs approved for the Meta worker.
  --facebook-run-worker <bool> Run the Meta worker after queueing jobs.
  --facebook-dry-run <bool>    Dry-run Meta worker publishing/measurement.
  --facebook-limit <n>         Max Facebook Page jobs this cycle.
  --setup-check                Load env and print present/missing setup only.
  --json                       Print full JSON report.
  --help                       Show this help.
`);
}

function printSetupCheck(setup = {}) {
  console.log('3DVR auto-business setup check');
  console.log(`Env files loaded: ${setup.envFilesLoaded?.length ? setup.envFilesLoaded.join(', ') : 'none'}`);
  console.log(`Core AI: ${setup.ready?.coreAi ? 'present' : 'missing'}`);
  console.log(`Owner email: ${setup.ready?.ownerEmail ? 'present' : 'missing'}`);
  console.log(`Mail reports: ${setup.ready?.mailReports ? 'ready' : 'missing setup'}`);
  console.log(`Checkout link: ${setup.ready?.checkout ? 'present' : 'missing'}`);
  console.log(`Facebook Page posting: ${setup.ready?.facebookPagePosting ? 'ready' : 'missing setup'}`);
  console.log(`Outreach: ${setup.ready?.outreach ? 'ready' : 'missing setup'}`);
  console.log('');

  for (const item of setup.credentials || []) {
    const accepted = item.accepted?.length ? ` (${item.accepted.join(' / ')})` : '';
    console.log(`${item.ok ? 'OK' : 'MISSING'} ${item.key}${accepted}`);
    if (!item.ok && item.help) {
      console.log(`  ${item.help}`);
    }
  }
}

export function buildCycleEvidence(report = {}, previousSignals = {}) {
  const evidence = deriveEvidence({
    autopilot: report.autopilot || null,
    outbound: {
      generatedAt: report.generatedAt || new Date().toISOString(),
      autopilotRunId: report.autopilot?.runId || '',
      dispatch: { sentCount: Number(report.outreach?.sent || 0) },
      queue: [],
      revenue: report.autopilot?.revenue || null
    },
    outcomes: [],
    marketPulse: report.marketPulse || null
  });

  const previous = previousSignals || {};
  const currentOutreach = Number(previous.outreach_sent || 0);
  const sentThisCycle = Number(report.outreach?.sent || 0);
  evidence.signals.outreach_sent = currentOutreach + Math.max(0, sentThisCycle);

  // Funnel and revenue signals are cumulative learning evidence. Never let a source
  // that only reports its latest window erase previously observed progress.
  for (const [key, value] of Object.entries(evidence.signals || {})) {
    if (key === 'outreach_sent' || key === 'stripe_mrr_cents') continue;
    const prior = Number(previous[key] || 0);
    const observed = Number(value || 0);
    if (Number.isFinite(prior) && Number.isFinite(observed)) {
      evidence.signals[key] = Math.max(prior, observed);
    }
  }

  evidence.source = 'auto-business-cycle';
  evidence.observed_at = report.generatedAt || new Date().toISOString();
  evidence.note = String(report.critique?.nextMoneyMove || '').slice(0, 500);
  return evidence;
}

export async function attachCycleLearning(rootDir, report = {}) {
  const before = await updateLearningLedger({ rootDir });
  const evidence = buildCycleEvidence(report, before.ledger?.current_signals || {});
  const learning = await updateLearningLedger({
    rootDir,
    evidence,
    recordObservation: true
  });

  report.learning = learning.summary;
  report.learningLedgerPath = learning.ledgerPath;
  report.learningOutcome = learning.outcome;
  if (report.paths?.latestReportPath) {
    await writeFile(report.paths.latestReportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }
  return learning;
}

async function main() {
  const args = parseArgs();
  if (args.help || args.h) {
    printHelp();
    return;
  }

  const rootDir = path.resolve(args.root || process.cwd());
  if (args.setupCheck) {
    const setup = await checkAutoBusinessSetup({
      rootDir,
      market: args.market,
      keywords: args.keywords,
      channels: args.channels,
      dryRun: parseBool(args.dryRun),
      outreachEnabled: parseBool(args.outreachEnabled),
      outreachMode: args.outreachMode,
      outreachDailyLimit: args.outreachDailyLimit ? Number(args.outreachDailyLimit) : undefined,
      contactsFile: args.contactsFile,
      suppressionFile: args.suppressionFile,
      facebookQueueEnabled: parseBool(args.facebookQueue),
      facebookAutoApprove: parseBool(args.facebookAutoApprove),
      facebookRunWorker: parseBool(args.facebookRunWorker),
      facebookDryRun: parseBool(args.facebookDryRun),
      facebookLimit: args.facebookLimit ? Number(args.facebookLimit) : undefined
    });

    if (args.json) {
      console.log(JSON.stringify(setup, null, 2));
      return;
    }

    printSetupCheck(setup);
    return;
  }

  // Initialize/read learning before the full cycle. The nested supervisor still uses the
  // saved decision to plan, but it defers the no-signal wake observation so the whole
  // market/offer/outreach cycle counts as exactly one learning observation.
  await updateLearningLedger({ rootDir });
  const previousDefer = process.env.MONEY_PRINTER_DEFER_LEARNING_OBSERVATION;
  process.env.MONEY_PRINTER_DEFER_LEARNING_OBSERVATION = 'true';

  let report;
  try {
    report = await runAutoBusinessCycle({
      rootDir,
      market: args.market,
      keywords: args.keywords,
      channels: args.channels,
      dryRun: parseBool(args.dryRun),
      outreachEnabled: parseBool(args.outreachEnabled),
      outreachMode: args.outreachMode,
      outreachDailyLimit: args.outreachDailyLimit ? Number(args.outreachDailyLimit) : undefined,
      contactsFile: args.contactsFile,
      suppressionFile: args.suppressionFile,
      facebookQueueEnabled: parseBool(args.facebookQueue),
      facebookAutoApprove: parseBool(args.facebookAutoApprove),
      facebookRunWorker: parseBool(args.facebookRunWorker),
      facebookDryRun: parseBool(args.facebookDryRun),
      facebookLimit: args.facebookLimit ? Number(args.facebookLimit) : undefined
    });
  } finally {
    if (previousDefer === undefined) delete process.env.MONEY_PRINTER_DEFER_LEARNING_OBSERVATION;
    else process.env.MONEY_PRINTER_DEFER_LEARNING_OBSERVATION = previousDefer;
  }

  await attachCycleLearning(rootDir, report);

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log('3DVR auto-business cycle complete');
  console.log(`Market: ${report.config.market}`);
  console.log(`Top opportunity: ${report.autopilot?.topOpportunity?.title || report.marketPulse?.topOpportunity?.title || 'none'}`);
  console.log(`Selected market: ${report.marketResearch?.selectedMarket || report.config.market}`);
  console.log(`Facebook jobs queued: ${report.facebook?.queued || 0}/${report.facebook?.drafted || 0}`);
  console.log(`Outreach sent: ${report.outreach?.sent || 0}`);
  console.log(`Learning milestone: ${report.learning?.milestone || 'pre-revenue'}`);
  console.log(`Stranger customers: ${report.learning?.strangerCustomers || 0}/${report.learning?.strangerCustomerGoal || 10}`);
  console.log(`Next experiment: ${report.learning?.nextExperiment?.change_dimension || 'measurement'}`);
  console.log(`Owner email: ${report.ownerEmail?.sent ? 'sent' : report.ownerEmail?.reason || 'not sent'}`);
  console.log(`Missing setup items: ${report.credentials?.missing?.length || 0}`);
  console.log(`Report: ${report.paths?.latestReportPath || ''}`);
  console.log(`Next money move: ${report.critique?.nextMoneyMove || ''}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(`money-printer:auto-business: ${error.message}`);
    process.exitCode = 1;
  });
}

#!/usr/bin/env node

import path from 'node:path';
import process from 'node:process';
import { runAutoBusinessCycle } from '../src/money-printer/autoBusiness.js';

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
  --json                       Print full JSON report.
  --help                       Show this help.
`);
}

async function main() {
  const args = parseArgs();
  if (args.help || args.h) {
    printHelp();
    return;
  }

  const report = await runAutoBusinessCycle({
    rootDir: path.resolve(args.root || process.cwd()),
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
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log('3DVR auto-business cycle complete');
  console.log(`Market: ${report.config.market}`);
  console.log(`Top opportunity: ${report.autopilot?.topOpportunity?.title || report.marketPulse?.topOpportunity?.title || 'none'}`);
  console.log(`Selected market: ${report.marketResearch?.selectedMarket || report.config.market}`);
  console.log(`Facebook jobs queued: ${report.facebook?.queued || 0}/${report.facebook?.drafted || 0}`);
  console.log(`Outreach sent: ${report.outreach?.sent || 0}`);
  console.log(`Owner email: ${report.ownerEmail?.sent ? 'sent' : report.ownerEmail?.reason || 'not sent'}`);
  console.log(`Missing setup items: ${report.credentials?.missing?.length || 0}`);
  console.log(`Report: ${report.paths?.latestReportPath || ''}`);
  console.log(`Next money move: ${report.critique?.nextMoneyMove || ''}`);
}

main().catch(error => {
  console.error(`money-printer:auto-business: ${error.message}`);
  process.exitCode = 1;
});

#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import {
  buildCeoMarketBriefMarkdown,
  generateCeoMarketBrief
} from '../src/money-printer/ceoMarketBrief.js';

function parseArgs(argv = process.argv.slice(2)) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const [rawKey, inlineValue] = token.slice(2).split('=');
    const key = rawKey.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    if (inlineValue !== undefined) {
      args[key] = inlineValue;
      continue;
    }
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

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export async function runCeoMarketBrief(options = {}) {
  const rootDir = path.resolve(options.root || process.cwd());
  const outDir = path.resolve(rootDir, options.outDir || '.money-printer/operator');
  await mkdir(outDir, { recursive: true });
  const brief = generateCeoMarketBrief({
    date: options.date || new Date()
  });
  const markdown = buildCeoMarketBriefMarkdown(brief);
  const jsonPath = path.join(outDir, 'ceo-market-brief-latest.json');
  const markdownPath = path.join(outDir, 'ceo-market-brief-latest.md');
  await writeJson(jsonPath, brief);
  await writeFile(markdownPath, markdown, 'utf8');
  return {
    brief,
    jsonPath,
    markdownPath
  };
}

async function main() {
  const args = parseArgs();
  const result = await runCeoMarketBrief({
    root: args.root,
    outDir: args.outDir,
    date: args.date
  });
  if (args.json) {
    console.log(JSON.stringify({
      decision: result.brief.decision,
      offer: result.brief.offer,
      drafts: result.brief.reviewQueueDrafts.map(item => ({
        leadName: item.leadName,
        riskLevel: item.riskLevel,
        requiresReview: item.requiresReview
      })),
      jsonPath: result.jsonPath,
      markdownPath: result.markdownPath
    }, null, 2));
    return;
  }
  console.log(`Money Printer CEO Market Brief: ${result.brief.decision}`);
  console.log(`Offer: ${result.brief.offer.name} (${result.brief.offer.price})`);
  console.log(`Drafts queued for review: ${result.brief.reviewQueueDrafts.length}`);
  console.log(`Report: ${path.relative(process.cwd(), result.markdownPath)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(`money-printer-ceo-brief: ${error.message}`);
    process.exitCode = 1;
  });
}

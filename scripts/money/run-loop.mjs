import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { runMoneyLoop } from '../../src/money/engine.js';

function parseList(value = '') {
  return String(value)
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function parseArgs(argv = []) {
  const args = {
    market: 'solo founders and creator businesses',
    keywords: '',
    channels: 'reddit,x,linkedin',
    budget: '150',
    out: ''
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      continue;
    }

    const key = token.slice(2);
    const value = argv[index + 1] && !argv[index + 1].startsWith('--')
      ? argv[index + 1]
      : 'true';

    args[key] = value;

    if (value !== 'true') {
      index += 1;
    }
  }

  return args;
}

function printSummary(report) {
  console.log(`Run: ${report.runId}`);
  console.log(`Generated: ${report.generatedAt}`);
  console.log(`Used OpenAI: ${report.usedOpenAi ? 'yes' : 'no'}`);
  console.log(`Signals analyzed: ${report.signals.length}`);
  console.log('');
  console.log('Top opportunities:');

  report.opportunities.slice(0, 3).forEach((opportunity, index) => {
    console.log(`${index + 1}. ${opportunity.title} (score ${opportunity.score})`);
    console.log(`   Price: ${opportunity.suggestedPrice}`);
    console.log(`   Problem: ${opportunity.problem}`);
  });

  console.log('');
  console.log('Execution checklist:');
  report.executionChecklist.forEach((item, index) => {
    console.log(`${index + 1}. ${item}`);
  });

  if (report.warnings.length) {
    console.log('');
    console.log('Warnings:');
    report.warnings.forEach(item => console.log(`- ${item}`));
  }
}

async function writeOutput(pathname, report) {
  const absolutePath = resolve(pathname);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`\nSaved full report to ${absolutePath}`);
}

async function main() {
  const cli = parseArgs(process.argv.slice(2));

  const payload = {
    market: cli.market,
    keywords: parseList(cli.keywords),
    channels: parseList(cli.channels),
    budget: Number(cli.budget)
  };

  const report = await runMoneyLoop(payload, {
    openAiApiKey: process.env.OPENAI_API_KEY,
    openAiModel: process.env.OPENAI_MODEL
  });

  printSummary(report);

  if (cli.out) {
    await writeOutput(cli.out, report);
  }
}

main().catch(error => {
  console.error(error?.message || error);
  process.exit(1);
});

#!/usr/bin/env node

import path from 'node:path';
import process from 'node:process';
import {
  buildMetrics,
  generateFounderCommandBrief,
  generateMoneyIdeas,
  generateValidationTest,
  getNextBestMoneyAction,
  promoteIdeaToExperiment,
  runBotLoop,
  scoreBusinessIdeas,
  summarizePortfolio,
  updateBusinessConfigFromMission
} from '../src/money-printer/moneyPrinterCore.js';
import { runMoneyPrinterDaemonCycle } from '../src/money-printer/moneyPrinterDaemon.js';
import {
  appendMoneyPrinterEvent,
  ensureMoneyPrinterWorkspace,
  loadMoneyPrinterWorkspace,
  saveBusinessConfig,
  saveExperiments,
  saveIdeas
} from '../src/money-printer/moneyPrinterFileStorage.js';

const BOT_ALIASES = {
  executive: 'executive-agent',
  'executive-agent': 'executive-agent',
  'business-idea-generator': 'business-idea-generator-bot',
  'business-idea-generator-bot': 'business-idea-generator-bot',
  'market-research': 'market-research-bot',
  'market-research-bot': 'market-research-bot',
  validation: 'validation-bot',
  'validation-bot': 'validation-bot',
  'founder-brief': 'founder-brief-bot',
  'founder-brief-bot': 'founder-brief-bot',
  'system-improvement': 'system-improvement-bot',
  'system-improvement-bot': 'system-improvement-bot',
  'kill-or-scale': 'kill-or-scale-bot',
  'kill-or-scale-bot': 'kill-or-scale-bot',
  'portfolio-manager': 'portfolio-manager-bot',
  'portfolio-manager-bot': 'portfolio-manager-bot'
};

function parseArgs(argv) {
  const flags = {};
  const positional = [];

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith('--')) {
      positional.push(value);
      continue;
    }

    const [rawKey, inlineValue] = value.slice(2).split('=');
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

  return {
    flags,
    positional
  };
}

function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

function formatMoney(value = 0) {
  return `$${Number(value || 0).toLocaleString('en-US')}`;
}

function printHelp() {
  console.log(`money-printer CLI

Usage:
  npm run money-printer -- init
  npm run money-printer -- mission "Launch an AI web agency for local service businesses"
  npm run money-printer -- ideas --count 5 --save
  npm run money-printer -- promote <idea-id>
  npm run money-printer -- brief
  npm run money-printer -- run executive
  npm run money-printer -- status
  npm run money-printer -- daemon --once

Commands:
  init                  Create .money-printer workspace files
  mission <text>        Update business mission and config
  ideas                 Generate scored ideas (--count, --json, --save)
  promote <idea-id>     Promote a saved idea to an experiment
  brief                 Generate Founder Command Brief
  run <bot-name>        Run a mock/dry-run bot loop
  status                Show operator status
  daemon --once         Run one safe daemon cycle and write report/log
`);
}

function printIdeaList(ideas = []) {
  ideas.forEach((idea, index) => {
    console.log(`${index + 1}. ${idea.business_name} [${idea.total_score}/100, ${idea.recommendation}]`);
    console.log(`   id: ${idea.id}`);
    console.log(`   buyer: ${idea.target_customer}`);
    console.log(`   offer: ${idea.offer}`);
    console.log(`   first test: ${idea.first_test_this_week}`);
  });
}

function printBrief(brief = {}) {
  console.log('Founder Command Brief');
  console.log(`Mission: ${brief.currentMission}`);
  console.log(`Best opportunity: ${brief.bestNewOpportunity}`);
  console.log(`First customer: ${brief.suggestedFirstCustomer}`);
  console.log(`Primary offer: ${brief.primaryOffer}`);
  console.log(`Fastest dollar: ${brief.fastestPathToFirstDollar}`);
  console.log('Next 3 actions:');
  (brief.next3Actions || []).forEach((action, index) => console.log(`  ${index + 1}. ${action}`));
  console.log(`Bot next: ${brief.botToRunNext}`);
  console.log(`Biggest risk: ${brief.biggestRisk}`);
  console.log(`Kill: ${brief.currentExperimentToKill}`);
  console.log(`Scale: ${brief.currentExperimentToScale}`);
  console.log(`Highest leverage improvement: ${brief.highestLeverageImprovementThisWeek}`);
  console.log(`Next Best Money Action: ${brief.nextBestMoneyAction}`);
}

function printBotOutput(output = {}) {
  console.log(output.title || 'Bot output');
  console.log(output.summary || '');
  (output.lines || []).forEach(line => console.log(`- ${line}`));
}

function summarizeOutput(output = {}) {
  return output.summary || output.title || 'Money Printer command completed.';
}

async function commandInit(rootDir) {
  const { paths, created } = await ensureMoneyPrinterWorkspace(rootDir);
  console.log(`Money Printer workspace: ${path.relative(rootDir, paths.workspaceDir) || paths.workspaceDir}`);
  console.log(created.length ? `Created ${created.length} file(s).` : 'Workspace already exists.');
  console.log(`Config: ${path.relative(rootDir, paths.businessPath)}`);
  console.log(`Ideas: ${path.relative(rootDir, paths.ideasPath)}`);
  console.log(`Experiments: ${path.relative(rootDir, paths.experimentsPath)}`);
}

async function commandMission(rootDir, args) {
  const mission = args.join(' ').trim();
  if (!mission) {
    throw new Error('Missing mission text. Example: npm run money-printer -- mission "Launch an AI web agency"');
  }

  const loaded = await loadMoneyPrinterWorkspace(rootDir);
  const topIdea = loaded.ideas[0] || null;
  const businessConfig = updateBusinessConfigFromMission(mission, topIdea, loaded.businessConfig);
  await saveBusinessConfig(rootDir, businessConfig);
  await appendMoneyPrinterEvent(rootDir, {
    command: 'mission',
    inputSummary: mission,
    outputSummary: `Updated business config for ${businessConfig.target_customers[0]}`,
    nextAction: 'Run ideas --count 5 --save'
  });

  console.log(`Mission updated: ${businessConfig.mission}`);
  console.log(`Primary customer: ${businessConfig.target_customers[0]}`);
  console.log(`Primary offer: ${businessConfig.primary_offer}`);
}

async function commandIdeas(rootDir, flags) {
  const loaded = await loadMoneyPrinterWorkspace(rootDir);
  const count = Number.parseInt(flags.count || '5', 10);
  const limit = Number.isFinite(count) && count > 0 ? count : 5;
  const ideas = scoreBusinessIdeas(generateMoneyIdeas(loaded.businessConfig.mission)).slice(0, limit);

  if (flags.save) {
    await saveIdeas(rootDir, ideas);
  }

  await appendMoneyPrinterEvent(rootDir, {
    command: 'ideas',
    inputSummary: `${loaded.businessConfig.mission}; count=${limit}`,
    outputSummary: `Generated ${ideas.length} scored business ideas.`,
    nextAction: ideas[0]
      ? `Promote ${ideas[0].id} or run Validation Bot.`
      : 'Set a clearer mission and regenerate ideas.'
  });

  if (flags.json) {
    printJson(ideas);
    return;
  }

  console.log(`Generated ${ideas.length} scored ideas${flags.save ? ' and saved them' : ''}.`);
  printIdeaList(ideas);
}

async function commandPromote(rootDir, args) {
  const ideaId = args[0];
  if (!ideaId) {
    throw new Error('Missing idea id. Run ideas --save first, then promote <idea-id>.');
  }

  const loaded = await loadMoneyPrinterWorkspace(rootDir);
  const idea = loaded.ideas.find(item => item.id === ideaId);
  if (!idea) {
    throw new Error(`Idea not found: ${ideaId}. Run ideas --save and use one of the saved idea ids.`);
  }

  const experiment = promoteIdeaToExperiment(idea);
  const exists = loaded.experiments.some(item => item.id === experiment.id);
  const experiments = exists ? loaded.experiments : [experiment, ...loaded.experiments];
  await saveExperiments(rootDir, experiments);
  await appendMoneyPrinterEvent(rootDir, {
    command: 'promote',
    inputSummary: ideaId,
    outputSummary: `${exists ? 'Found existing experiment' : 'Promoted idea'}: ${experiment.name}`,
    nextAction: experiment.next_action
  });

  console.log(`${exists ? 'Already active' : 'Promoted'}: ${experiment.name}`);
  console.log(`Experiment id: ${experiment.id}`);
  console.log(`Validation test: ${experiment.validation_test}`);
  console.log(`Next action: ${experiment.next_action}`);
}

async function commandBrief(rootDir) {
  const loaded = await loadMoneyPrinterWorkspace(rootDir);
  const brief = generateFounderCommandBrief(loaded.state);
  await appendMoneyPrinterEvent(rootDir, {
    command: 'brief',
    inputSummary: loaded.businessConfig.mission,
    outputSummary: brief.nextBestMoneyAction,
    nextAction: brief.nextBestMoneyAction
  });
  printBrief(brief);
}

async function commandRun(rootDir, args) {
  const rawBotName = args[0];
  if (!rawBotName) {
    throw new Error(`Missing bot name. Supported: ${Object.keys(BOT_ALIASES).join(', ')}`);
  }

  const botId = BOT_ALIASES[rawBotName] || rawBotName;
  const loaded = await loadMoneyPrinterWorkspace(rootDir);
  const output = runBotLoop(botId, loaded.state);
  await appendMoneyPrinterEvent(rootDir, {
    command: 'run',
    bot: botId,
    inputSummary: loaded.businessConfig.mission,
    outputSummary: summarizeOutput(output),
    nextAction: getNextBestMoneyAction(loaded.state)
  });
  printBotOutput(output);
}

async function commandStatus(rootDir) {
  const loaded = await loadMoneyPrinterWorkspace(rootDir);
  const metrics = buildMetrics(loaded.state);
  const portfolio = summarizePortfolio(loaded.experiments);

  console.log('Money Printer Status');
  console.log(`Mission: ${loaded.businessConfig.mission}`);
  console.log(`Ideas Generated: ${metrics.ideasGenerated}`);
  console.log(`Experiments Active: ${metrics.experimentsActive}`);
  console.log(`Offers Launched: ${metrics.offersLaunched}`);
  console.log(`Leads Found: ${metrics.leadsFound}`);
  console.log(`Replies: ${metrics.replies}`);
  console.log(`Calls Booked: ${metrics.callsBooked}`);
  console.log(`Revenue Tracked: ${formatMoney(metrics.revenueTracked)}`);
  console.log(`Portfolio Focus: ${portfolio.primaryFocus}`);
  console.log(`Next Best Money Action: ${metrics.nextBestMoneyAction}`);
}

async function commandDaemon(rootDir, flags) {
  const result = await runMoneyPrinterDaemonCycle({
    rootDir,
    command: flags.once ? 'daemon --once' : 'daemon dry-run'
  });

  console.log(flags.once
    ? 'Daemon dry-run cycle completed once.'
    : 'Daemon long-running scheduler is not enabled in this MVP; completed one safe dry-run cycle.');
  console.log(`Report: ${path.relative(rootDir, result.reportPath)}`);
  console.log(`Event log: ${path.relative(rootDir, result.eventLogPath)}`);
  console.log(`Next action: ${result.report.nextBestMoneyAction}`);
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const { flags, positional } = parseArgs(rest);
  const rootDir = process.cwd();

  switch (command) {
    case undefined:
    case 'help':
    case '--help':
    case '-h':
      printHelp();
      break;
    case 'init':
      await commandInit(rootDir);
      break;
    case 'mission':
      await commandMission(rootDir, positional);
      break;
    case 'ideas':
      await commandIdeas(rootDir, flags);
      break;
    case 'promote':
      await commandPromote(rootDir, positional);
      break;
    case 'brief':
      await commandBrief(rootDir);
      break;
    case 'run':
      await commandRun(rootDir, positional);
      break;
    case 'status':
      await commandStatus(rootDir);
      break;
    case 'daemon':
      await commandDaemon(rootDir, flags);
      break;
    case 'validation': {
      const loaded = await loadMoneyPrinterWorkspace(rootDir);
      const idea = loaded.ideas[0] || generateMoneyIdeas(loaded.businessConfig.mission)[0];
      printJson(generateValidationTest(idea));
      break;
    }
    default:
      throw new Error(`Unknown command: ${command}. Run npm run money-printer -- help`);
  }
}

main().catch(error => {
  console.error(`money-printer: ${error.message}`);
  process.exitCode = 1;
});

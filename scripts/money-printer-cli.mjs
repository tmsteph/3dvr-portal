#!/usr/bin/env node

import path from 'node:path';
import process from 'node:process';
import { existsSync, readFileSync } from 'node:fs';
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
import {
  generateFounderBriefWithModel,
  generateStructuredIdeasWithModel,
  getModelProviderStatus,
  runBotWithModel
} from '../src/money-printer/moneyPrinterModelProvider.js';
import {
  addMoneyPrinterOperations,
  approveMoneyPrinterOperation,
  executeApprovedMoneyPrinterOperations,
  executeMoneyPrinterOperation,
  loadMoneyPrinterOperations
} from '../src/money-printer/moneyPrinterOperations.js';
import {
  detectCodexCli,
  generateAndSaveCodexPrompt,
  getCodexRunnerStatus,
  runCodexPrompt
} from '../src/money-printer/moneyPrinterCodexRunner.js';
import { readGithubStatus } from '../src/money-printer/moneyPrinterGithubConnector.js';
import { readVercelStatus } from '../src/money-printer/moneyPrinterVercelConnector.js';

const BOT_ALIASES = {
  executive: 'executive-agent',
  'executive-agent': 'executive-agent',
  'business-idea-generator': 'business-idea-generator-bot',
  'business-idea-generator-bot': 'business-idea-generator-bot',
  'opportunity-scanner': 'opportunity-scanner-bot',
  'opportunity-scanner-bot': 'opportunity-scanner-bot',
  'market-research': 'market-research-bot',
  'market-research-bot': 'market-research-bot',
  validation: 'validation-bot',
  'validation-bot': 'validation-bot',
  'mvp-builder': 'mvp-builder-bot',
  'mvp-builder-bot': 'mvp-builder-bot',
  'founder-brief': 'founder-brief-bot',
  'founder-brief-bot': 'founder-brief-bot',
  'system-improvement': 'system-improvement-bot',
  'system-improvement-bot': 'system-improvement-bot',
  'kill-or-scale': 'kill-or-scale-bot',
  'kill-or-scale-bot': 'kill-or-scale-bot',
  'portfolio-manager': 'portfolio-manager-bot',
  'portfolio-manager-bot': 'portfolio-manager-bot',
  'github-builder': 'github-builder-bot',
  'github-builder-bot': 'github-builder-bot',
  'vercel-deployment': 'vercel-deployment-bot',
  'vercel-deployment-bot': 'vercel-deployment-bot',
  'website-builder': 'website-builder-bot',
  'website-builder-bot': 'website-builder-bot',
  'lead-finder': 'lead-finder-bot',
  'lead-finder-bot': 'lead-finder-bot',
  'outreach-drafting': 'outreach-drafting-bot',
  'outreach-drafting-bot': 'outreach-drafting-bot'
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

function parseEnvLine(line = '') {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) {
    return null;
  }
  const index = trimmed.indexOf('=');
  const key = trimmed.slice(0, index).trim();
  let value = trimmed.slice(index + 1).trim();
  if (!key || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
    return null;
  }
  if (
    (value.startsWith('"') && value.endsWith('"'))
    || (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  return [key, value];
}

function loadLocalEnv(rootDir = process.cwd()) {
  const merged = {};
  for (const file of ['.env', '.env.local']) {
    const filePath = path.resolve(rootDir, file);
    if (!existsSync(filePath)) continue;
    const lines = readFileSync(filePath, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const entry = parseEnvLine(line);
      if (entry) {
        merged[entry[0]] = entry[1];
      }
    }
  }
  for (const [key, value] of Object.entries(merged)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
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
  npm run money-printer -- ai-status
  npm run money-printer -- daemon --once
  npm run money-printer -- operations
  npm run money-printer -- codex prompt --bot website-builder

Commands:
  init                  Create .money-printer workspace files
  mission <text>        Update business mission and config
  ideas                 Generate scored ideas (--count, --json, --save, --ai, --mock, --model)
  promote <idea-id>     Promote a saved idea to an experiment
  brief                 Generate Founder Command Brief (--ai, --mock, --json)
  run <bot-name>        Run a bot loop (--ai, --mock, --model, --save, --json)
  status                Show operator status
  ai-status             Show provider, connector, and Codex runtime status
  daemon --once         Run one safe daemon cycle and write report/log (--ai, --execute, --json)
  operations            List/approve/execute operation plans
  codex                 Generate or optionally run Codex prompts
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

function buildAiOptions(flags = {}, rootDir = process.cwd()) {
  return {
    rootDir,
    ai: flags.ai === true,
    mock: flags.mock === true,
    model: typeof flags.model === 'string' ? flags.model : undefined,
    execute: flags.execute === true,
    planOnly: flags.planOnly === true
  };
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
  const aiOptions = buildAiOptions(flags, rootDir);
  const aiResult = flags.ai || flags.mock
    ? await generateStructuredIdeasWithModel(loaded.state, { ...aiOptions, count: limit })
    : null;
  const ideas = aiResult?.ideas || scoreBusinessIdeas(generateMoneyIdeas(loaded.businessConfig.mission)).slice(0, limit);

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
    printJson(aiResult ? { ...aiResult, ideas } : ideas);
    return;
  }

  console.log(`Generated ${ideas.length} scored ideas${flags.save ? ' and saved them' : ''}.`);
  if (aiResult?.aiMode) {
    console.log(`AI mode: ${aiResult.aiMode}${aiResult.model ? ` (${aiResult.model})` : ''}`);
  }
  if (aiResult?.modelFallback) {
    console.log(`Model fallback: ${aiResult.modelError}`);
    console.log(`Raw output: ${path.relative(rootDir, aiResult.rawOutputPath)}`);
  }
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

async function commandBrief(rootDir, flags = {}) {
  const loaded = await loadMoneyPrinterWorkspace(rootDir);
  const aiResult = flags.ai || flags.mock
    ? await generateFounderBriefWithModel(loaded.state, buildAiOptions(flags, rootDir))
    : null;
  const brief = aiResult?.brief || generateFounderCommandBrief(loaded.state);
  await appendMoneyPrinterEvent(rootDir, {
    command: 'brief',
    inputSummary: loaded.businessConfig.mission,
    outputSummary: brief.nextBestMoneyAction,
    nextAction: brief.nextBestMoneyAction,
    aiMode: aiResult?.aiMode || 'mock'
  });
  if (flags.json) {
    printJson(aiResult ? { ...aiResult, brief } : brief);
    return;
  }
  if (aiResult?.aiMode) {
    console.log(`AI mode: ${aiResult.aiMode}${aiResult.model ? ` (${aiResult.model})` : ''}`);
  }
  printBrief(brief);
}

async function commandRun(rootDir, args, flags = {}) {
  const rawBotName = args[0];
  if (!rawBotName) {
    throw new Error(`Missing bot name. Supported: ${Object.keys(BOT_ALIASES).join(', ')}`);
  }

  const botId = BOT_ALIASES[rawBotName] || rawBotName;
  const loaded = await loadMoneyPrinterWorkspace(rootDir);
  const output = flags.ai || flags.mock
    ? await runBotWithModel(botId, loaded.state, buildAiOptions(flags, rootDir))
    : runBotLoop(botId, loaded.state);
  if (flags.save && Array.isArray(output.connectorOperations) && output.connectorOperations.length) {
    await addMoneyPrinterOperations(rootDir, output.connectorOperations);
  }
  await appendMoneyPrinterEvent(rootDir, {
    command: 'run',
    bot: botId,
    inputSummary: loaded.businessConfig.mission,
    outputSummary: summarizeOutput(output),
    nextAction: output.nextBestMoneyAction || getNextBestMoneyAction(loaded.state),
    aiMode: output.aiMode || 'mock',
    model: output.model || ''
  });
  if (flags.json) {
    printJson(output);
    return;
  }
  if (output.aiMode) {
    console.log(`AI mode: ${output.aiMode}${output.model ? ` (${output.model})` : ''}`);
  }
  if (output.modelFallback) {
    console.log(`Model fallback: ${output.modelError}`);
    console.log(`Raw output: ${path.relative(rootDir, output.rawOutputPath)}`);
  }
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
    command: flags.once ? 'daemon --once' : 'daemon dry-run',
    ...buildAiOptions(flags, rootDir)
  });

  if (flags.json) {
    printJson(result);
    return;
  }

  console.log(flags.once
    ? 'Daemon dry-run cycle completed once.'
    : 'Daemon long-running scheduler is not enabled in this MVP; completed one safe dry-run cycle.');
  console.log(`AI mode: ${result.report.aiMode || 'mock'}${result.report.model ? ` (${result.report.model})` : ''}`);
  console.log(`Report: ${path.relative(rootDir, result.reportPath)}`);
  console.log(`Event log: ${path.relative(rootDir, result.eventLogPath)}`);
  console.log(`Operations planned: ${result.report.connectorOperationsPlanned.length}`);
  console.log(`Operations executed: ${result.report.connectorOperationsExecuted.length}`);
  console.log(`Codex prompt: ${path.relative(rootDir, result.report.codexPromptPath)}`);
  console.log(`Next action: ${result.report.nextBestMoneyAction}`);
}

async function commandAiStatus(rootDir, flags) {
  const status = getModelProviderStatus(buildAiOptions(flags, rootDir));
  const [codex, github, vercel] = await Promise.all([
    detectCodexCli(),
    readGithubStatus(),
    readVercelStatus()
  ]);
  const payload = {
    aiMode: status.mode,
    requestedMode: status.requestedMode,
    openAiKeyPresent: status.openAiKeyPresent,
    model: status.model,
    fastModel: status.fastModel,
    reasoningModel: status.reasoningModel,
    liveConnectorsEnabled: status.liveConnectorsEnabled,
    allowGithubWrite: status.allowGithubWrite,
    allowVercelWrite: status.allowVercelWrite,
    allowCodexExec: status.allowCodexExec,
    codex: {
      available: codex.available,
      command: codex.command,
      version: codex.version || ''
    },
    github: {
      configured: github.configured,
      tokenPresent: github.tokenPresent,
      repo: github.repo,
      allowWrite: github.allowWrite,
      missing: github.missing
    },
    vercel: {
      configured: vercel.configured,
      tokenPresent: vercel.tokenPresent,
      projectIdPresent: Boolean(vercel.projectId),
      teamIdPresent: vercel.teamIdPresent,
      allowWrite: vercel.allowWrite,
      missing: vercel.missing
    },
    daemonReady: true
  };
  if (flags.json) {
    printJson(payload);
    return;
  }
  console.log('Money Printer AI Status');
  console.log(`AI mode: ${payload.aiMode}`);
  console.log(`OpenAI key: ${payload.openAiKeyPresent ? 'present' : 'missing'}`);
  console.log(`Model: ${payload.model}`);
  console.log(`Live connectors: ${payload.liveConnectorsEnabled ? 'enabled' : 'disabled'}`);
  console.log(`Codex CLI: ${payload.codex.available ? `available ${payload.codex.version}` : 'missing'}`);
  console.log(`GitHub: ${payload.github.configured ? `configured for ${payload.github.repo}` : `missing ${payload.github.missing.join(', ')}`}`);
  console.log(`Vercel: ${payload.vercel.configured ? 'configured' : `missing ${payload.vercel.missing.join(', ')}`}`);
  console.log(`GitHub write: ${payload.allowGithubWrite ? 'allowed' : 'blocked'}`);
  console.log(`Vercel write: ${payload.allowVercelWrite ? 'allowed' : 'blocked'}`);
  console.log(`Codex exec: ${payload.allowCodexExec ? 'allowed' : 'blocked'}`);
}

async function commandOperations(rootDir, args, flags) {
  const subcommand = args[0] || 'list';
  if (subcommand === 'approve') {
    const operation = await approveMoneyPrinterOperation(rootDir, args[1]);
    if (flags.json) {
      printJson(operation);
      return;
    }
    console.log(`Approved operation: ${operation.id}`);
    console.log(`Status: ${operation.status}`);
    return;
  }
  if (subcommand === 'execute') {
    const operation = await executeMoneyPrinterOperation(rootDir, args[1], {
      ...buildAiOptions(flags, rootDir),
      execute: flags.execute === true
    });
    if (flags.json) {
      printJson(operation);
      return;
    }
    console.log(`Operation ${operation.id}: ${operation.status}`);
    console.log(operation.result?.message || operation.result?.htmlUrl || operation.result?.status || '');
    return;
  }
  if (subcommand === 'execute-approved') {
    const results = await executeApprovedMoneyPrinterOperations(rootDir, {
      ...buildAiOptions(flags, rootDir),
      execute: flags.execute === true
    });
    if (flags.json) {
      printJson(results);
      return;
    }
    console.log(`Executed approved operations: ${results.length}`);
    results.forEach(operation => console.log(`${operation.id}: ${operation.status}`));
    return;
  }

  const provider = typeof flags.provider === 'string' ? flags.provider.toLowerCase() : '';
  const operations = (await loadMoneyPrinterOperations(rootDir))
    .filter(operation => !provider || operation.provider === provider);
  if (flags.json) {
    printJson(operations);
    return;
  }
  console.log('Money Printer Operations');
  if (!operations.length) {
    console.log('No operations planned yet.');
    return;
  }
  operations.forEach(operation => {
    console.log(`${operation.id} [${operation.status}/${operation.risk}] ${operation.provider}.${operation.action}`);
    console.log(`  ${operation.title}`);
  });
}

async function commandCodex(rootDir, args, flags) {
  const subcommand = args[0] || 'status';
  const loaded = await loadMoneyPrinterWorkspace(rootDir);
  const bot = BOT_ALIASES[flags.bot] || flags.bot || '';
  if (subcommand === 'status') {
    const detection = await detectCodexCli();
    const status = getCodexRunnerStatus();
    const payload = { ...status, ...detection };
    if (flags.json) {
      printJson(payload);
      return;
    }
    console.log('Money Printer Codex Status');
    console.log(`Codex CLI: ${detection.available ? `available ${detection.version}` : 'missing'}`);
    console.log(`Codex exec: ${status.allowCodexExec ? 'allowed' : 'blocked'}`);
    return;
  }
  if (subcommand === 'prompt') {
    const result = await generateAndSaveCodexPrompt(rootDir, loaded.state, {
      ...buildAiOptions(flags, rootDir),
      bot
    });
    if (flags.json) {
      printJson(result);
      return;
    }
    console.log(`Codex prompt saved: ${path.relative(rootDir, result.promptPath)}`);
    return;
  }
  if (subcommand === 'run') {
    const result = await runCodexPrompt(rootDir, loaded.state, {
      ...buildAiOptions(flags, rootDir),
      bot,
      execute: flags.execute === true
    });
    if (flags.json) {
      printJson(result);
      return;
    }
    console.log(`Codex run: ${result.status}`);
    console.log(`Prompt: ${path.relative(rootDir, result.promptPath)}`);
    console.log(result.message || (result.ok ? 'Codex execution completed.' : 'Codex execution skipped.'));
    return;
  }
  throw new Error(`Unknown codex command: ${subcommand}`);
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const { flags, positional } = parseArgs(rest);
  const rootDir = process.cwd();
  loadLocalEnv(rootDir);

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
      await commandBrief(rootDir, flags);
      break;
    case 'run':
      await commandRun(rootDir, positional, flags);
      break;
    case 'status':
      await commandStatus(rootDir);
      break;
    case 'ai-status':
      await commandAiStatus(rootDir, flags);
      break;
    case 'daemon':
      await commandDaemon(rootDir, flags);
      break;
    case 'operations':
      await commandOperations(rootDir, positional, flags);
      break;
    case 'codex':
      await commandCodex(rootDir, positional, flags);
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

import {
  buildMetrics,
  generateFounderCommandBrief,
  getNextBestMoneyAction,
  runBotLoop
} from './moneyPrinterCore.js';
import {
  appendMoneyPrinterEvent,
  loadMoneyPrinterWorkspace,
  writeMoneyPrinterReport
} from './moneyPrinterFileStorage.js';
import { generateAndSaveCodexPrompt } from './moneyPrinterCodexRunner.js';
import {
  addMoneyPrinterOperations,
  executeApprovedMoneyPrinterOperations
} from './moneyPrinterOperations.js';
import {
  generateConnectorPlanWithModel,
  generateFounderBriefWithModel,
  generateStructuredIdeasWithModel,
  getModelProviderStatus,
  runBotWithModel
} from './moneyPrinterModelProvider.js';

// money-printer-daemon MVP: a safe dry-run cycle for future DigitalOcean scheduling.
// It intentionally performs no destructive provider calls and exits cleanly for development.

export async function runMoneyPrinterDaemonCycle(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const command = options.command || 'daemon';
  const botId = options.botId || 'executive-agent';
  const loaded = await loadMoneyPrinterWorkspace(rootDir);
  const providerStatus = getModelProviderStatus(options, options.env || process.env);
  const botOutput = options.ai
    ? await runBotWithModel(botId, loaded.state, { ...options, rootDir })
    : runBotLoop(botId, loaded.state);
  const ideaResult = loaded.state.ideas.length
    ? { ideas: loaded.state.ideas, aiMode: 'existing' }
    : await generateStructuredIdeasWithModel(loaded.state, { ...options, rootDir, count: 5 });
  const founderBriefResult = options.ai
    ? await generateFounderBriefWithModel(loaded.state, { ...options, rootDir })
    : { brief: generateFounderCommandBrief(loaded.state), aiMode: 'mock' };
  const founderBrief = founderBriefResult.brief;
  const metrics = buildMetrics(loaded.state);
  const nextBestMoneyAction = getNextBestMoneyAction(loaded.state);
  const connectorPlan = await generateConnectorPlanWithModel({
    ...loaded.state,
    ideas: ideaResult.ideas || loaded.state.ideas
  }, { ...options, rootDir });
  const operationsWrite = await addMoneyPrinterOperations(rootDir, [
    ...(botOutput.connectorOperations || []),
    ...(connectorPlan.operations || [])
  ]);
  const executedOperations = options.execute
    ? await executeApprovedMoneyPrinterOperations(rootDir, { ...options, execute: true })
    : [];
  const codexPrompt = await generateAndSaveCodexPrompt(rootDir, {
    ...loaded.state,
    ideas: ideaResult.ideas || loaded.state.ideas
  }, {
    ...options,
    bot: botId
  });

  const report = {
    generatedAt: new Date().toISOString(),
    mode: providerStatus.mode === 'openai' ? 'openai' : 'dry-run',
    aiMode: providerStatus.mode,
    model: providerStatus.model,
    command,
    botId,
    mission: loaded.state.businessConfig.mission,
    metrics,
    nextBestMoneyAction,
    founderBrief,
    botOutput,
    ideas: ideaResult.ideas || [],
    connectorOperationsPlanned: operationsWrite.added,
    connectorOperationsExecuted: executedOperations,
    nextCodexPrompt: codexPrompt.prompt,
    codexPromptPath: codexPrompt.promptPath,
    rawModelOutputPath: botOutput.rawOutputPath
      || connectorPlan.rawOutputPath
      || ideaResult.rawOutputPath
      || founderBriefResult.rawOutputPath
      || ''
  };

  const reportPath = await writeMoneyPrinterReport(rootDir, 'daemon-cycle', report);
  const log = await appendMoneyPrinterEvent(rootDir, {
    command,
    bot: botId,
    inputSummary: loaded.state.businessConfig.mission,
    outputSummary: botOutput.summary,
    nextAction: nextBestMoneyAction,
    aiMode: providerStatus.mode,
    model: providerStatus.model,
    operationsPlanned: operationsWrite.added.length,
    operationsExecuted: executedOperations.length
  });

  return {
    report,
    reportPath,
    event: log.event,
    eventLogPath: log.path
  };
}

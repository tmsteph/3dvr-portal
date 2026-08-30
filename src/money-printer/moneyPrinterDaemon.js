import {
  buildMetrics,
  generateFounderCommandBrief,
  getNextBestMoneyAction,
  runBotLoop
} from './moneyPrinterCore.js';
import {
  appendExecutiveDecision,
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
import { updateLearningLedger } from './learningRuntime.js';

// money-printer-daemon MVP: a safe dry-run cycle for future DigitalOcean scheduling.
// External and financial operations remain gated by the operation queue, while every
// wake cycle is now remembered so repeated failure can change the next experiment.

export async function runMoneyPrinterDaemonCycle(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const command = options.command || 'daemon';
  const botId = options.botId || 'executive-agent';
  const env = options.env || process.env;
  const loaded = await loadMoneyPrinterWorkspace(rootDir);
  const providerStatus = getModelProviderStatus(options, env);
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
  const baselineNextBestMoneyAction = getNextBestMoneyAction(loaded.state);
  const nextBestMoneyAction = botOutput.nextBestMoneyAction || baselineNextBestMoneyAction;
  const executiveDecisionWrite = botId === 'executive-agent'
    ? await appendExecutiveDecision(rootDir, {
      decision: botOutput.executiveDecision?.decision || botOutput.summary || nextBestMoneyAction,
      why: botOutput.executiveDecision?.why || botOutput.summary || '',
      nextAction: botOutput.nextBestMoneyAction || nextBestMoneyAction,
      whatNotToDo: botOutput.executiveDecision?.whatNotToDo || [],
      confidence: botOutput.executiveDecision?.confidence,
      bot: botId,
      model: botOutput.model || providerStatus.model,
      source: command
    })
    : null;
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

  const learningEvidenceDir = String(
    options.learningEvidenceDir
    || env.MONEY_PRINTER_EVIDENCE_DIR
    || ''
  ).trim();
  const learning = await updateLearningLedger({
    rootDir,
    evidenceDir: learningEvidenceDir,
    measurement: learningEvidenceDir ? null : {
      observed_at: new Date().toISOString(),
      source: command,
      experiment_id: loaded.state.experiments?.find(experiment => experiment.status === 'running')?.id
        || loaded.state.experiments?.[0]?.id
        || 'daemon-observation',
      note: `Money Printer wake cycle: ${botOutput.summary || nextBestMoneyAction}`
    },
    recordObservation: true
  });

  const report = {
    generatedAt: new Date().toISOString(),
    mode: providerStatus.mode === 'openai' ? 'openai' : 'dry-run',
    aiMode: providerStatus.mode,
    model: botOutput.model || providerStatus.model,
    command,
    botId,
    mission: loaded.state.businessConfig.mission,
    metrics,
    nextBestMoneyAction,
    founderBrief,
    botOutput,
    executiveDecision: executiveDecisionWrite?.entry || null,
    executiveDecisionPath: executiveDecisionWrite?.path || '',
    ideas: ideaResult.ideas || [],
    connectorOperationsPlanned: operationsWrite.added,
    connectorOperationsExecuted: executedOperations,
    nextCodexPrompt: codexPrompt.prompt,
    codexPromptPath: codexPrompt.promptPath,
    learning: learning.summary,
    learningLedgerPath: learning.ledgerPath,
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
    model: botOutput.model || providerStatus.model,
    operationsPlanned: operationsWrite.added.length,
    operationsExecuted: executedOperations.length,
    executiveDecisionId: executiveDecisionWrite?.entry?.id || '',
    learningMilestone: learning.summary.milestone,
    learningStalledCycles: learning.summary.stalledCycles,
    learningChangeDimension: learning.summary.nextExperiment?.change_dimension || ''
  });

  return {
    report,
    reportPath,
    event: log.event,
    eventLogPath: log.path,
    learning
  };
}

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
// External and financial operations remain gated by the operation queue. Learning is
// loaded and applied before planning so repeated failures actually change the next cycle.

function buildLearningDirective(learning = {}) {
  const decision = learning.summary?.nextExperiment || {};
  const progress = learning.ledger?.progress || {};
  const status = [
    `milestone=${progress.milestone || 'pre-revenue'}`,
    `stranger_customers=${Number(progress.stranger_customers || 0)}/${Number(progress.stranger_customer_goal || 10)}`,
    `stalled_cycles=${Number(progress.stalled_cycles || 0)}`,
    `autonomy_level=${Number(progress.autonomy?.level || 0)}`
  ].join(', ');
  if (!decision.should_adapt) {
    return `Learning status: ${status}. Continue the current experiment and measure ${decision.success_metric || 'qualified_leads'}.`;
  }
  return [
    `Learning status: ${status}.`,
    `Change exactly one dimension: ${decision.change_dimension || 'measurement'}.`,
    decision.reason || '',
    `Success metric: ${decision.success_metric || 'qualified_leads'}.`,
    decision.one_variable_rule || ''
  ].filter(Boolean).join(' ');
}

export async function runMoneyPrinterDaemonCycle(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const command = options.command || 'daemon';
  const botId = options.botId || 'executive-agent';
  const env = options.env || process.env;
  const loaded = await loadMoneyPrinterWorkspace(rootDir);

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
      note: 'Money Printer wake cycle started.'
    },
    recordObservation: true
  });
  const learningDirective = buildLearningDirective(learning);
  const planningState = {
    ...loaded.state,
    learning: learning.summary,
    learningLedger: {
      progress: learning.ledger?.progress || {},
      decision: learning.ledger?.decision || {},
      guardrails: learning.ledger?.guardrails || {}
    },
    businessConfig: {
      ...loaded.state.businessConfig,
      mission: `${loaded.state.businessConfig.mission}\n\nAUTONOMOUS LEARNING DIRECTIVE:\n${learningDirective}`
    }
  };

  const providerStatus = getModelProviderStatus(options, env);
  const botOutput = options.ai
    ? await runBotWithModel(botId, planningState, { ...options, rootDir })
    : runBotLoop(botId, planningState);
  const ideaResult = planningState.ideas.length
    ? { ideas: planningState.ideas, aiMode: 'existing' }
    : await generateStructuredIdeasWithModel(planningState, { ...options, rootDir, count: 5 });
  const founderBriefResult = options.ai
    ? await generateFounderBriefWithModel(planningState, { ...options, rootDir })
    : { brief: generateFounderCommandBrief(planningState), aiMode: 'mock' };
  const founderBrief = founderBriefResult.brief;
  const metrics = buildMetrics(planningState);
  const baselineNextBestMoneyAction = getNextBestMoneyAction(planningState);
  const learnedDecision = learning.summary?.nextExperiment || {};
  const learnedNextAction = learnedDecision.should_adapt
    ? `Run one ${learnedDecision.change_dimension || 'measurement'} experiment: ${learnedDecision.reason || 'adapt from the latest evidence.'}`
    : '';
  const nextBestMoneyAction = learnedNextAction || botOutput.nextBestMoneyAction || baselineNextBestMoneyAction;
  const executiveDecisionWrite = botId === 'executive-agent'
    ? await appendExecutiveDecision(rootDir, {
      decision: learnedNextAction || botOutput.executiveDecision?.decision || botOutput.summary || nextBestMoneyAction,
      why: learnedNextAction ? learningDirective : (botOutput.executiveDecision?.why || botOutput.summary || ''),
      nextAction: nextBestMoneyAction,
      whatNotToDo: botOutput.executiveDecision?.whatNotToDo || [],
      confidence: botOutput.executiveDecision?.confidence,
      bot: botId,
      model: botOutput.model || providerStatus.model,
      source: command
    })
    : null;
  const connectorPlan = await generateConnectorPlanWithModel({
    ...planningState,
    ideas: ideaResult.ideas || planningState.ideas
  }, { ...options, rootDir });
  const operationsWrite = await addMoneyPrinterOperations(rootDir, [
    ...(botOutput.connectorOperations || []),
    ...(connectorPlan.operations || [])
  ]);
  const budgetExhausted = Boolean(learning.ledger?.progress?.economics?.budget_exhausted);
  const executedOperations = options.execute && !budgetExhausted
    ? await executeApprovedMoneyPrinterOperations(rootDir, { ...options, execute: true })
    : [];
  const codexPrompt = await generateAndSaveCodexPrompt(rootDir, {
    ...planningState,
    ideas: ideaResult.ideas || planningState.ideas
  }, {
    ...options,
    bot: botId,
    learningDirective
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
    executionBlockedByBudget: Boolean(options.execute && budgetExhausted),
    nextCodexPrompt: codexPrompt.prompt,
    codexPromptPath: codexPrompt.promptPath,
    learning: learning.summary,
    learningDirective,
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
    learningChangeDimension: learning.summary.nextExperiment?.change_dimension || '',
    executionBlockedByBudget: Boolean(options.execute && budgetExhausted)
  });

  return {
    report,
    reportPath,
    event: log.event,
    eventLogPath: log.path,
    learning
  };
}

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

// money-printer-daemon MVP: a safe dry-run cycle for future DigitalOcean scheduling.
// It intentionally performs no destructive provider calls and exits cleanly for development.

export async function runMoneyPrinterDaemonCycle(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const command = options.command || 'daemon';
  const botId = options.botId || 'executive-agent';
  const loaded = await loadMoneyPrinterWorkspace(rootDir);
  const botOutput = runBotLoop(botId, loaded.state);
  const founderBrief = generateFounderCommandBrief(loaded.state);
  const metrics = buildMetrics(loaded.state);
  const nextBestMoneyAction = getNextBestMoneyAction(loaded.state);

  const report = {
    generatedAt: new Date().toISOString(),
    mode: 'dry-run',
    command,
    botId,
    mission: loaded.state.businessConfig.mission,
    metrics,
    nextBestMoneyAction,
    founderBrief,
    botOutput
  };

  const reportPath = await writeMoneyPrinterReport(rootDir, 'daemon-cycle', report);
  const log = await appendMoneyPrinterEvent(rootDir, {
    command,
    bot: botId,
    inputSummary: loaded.state.businessConfig.mission,
    outputSummary: botOutput.summary,
    nextAction: nextBestMoneyAction
  });

  return {
    report,
    reportPath,
    event: log.event,
    eventLogPath: log.path
  };
}

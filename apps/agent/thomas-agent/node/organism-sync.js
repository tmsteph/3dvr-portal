const { importContextHq, statePaths } = require('./digital-organism');
const { writeHeartbeat } = require('./agent-ops');
const {
  DEFAULT_TASK_OWNER,
  syncLocalTaskHandoffs,
} = require('./task-memory-sync');

const DEFAULT_INTERVAL_SECONDS = parsePositiveInteger(
  process.env.THREEDVR_ORGANISM_SYNC_INTERVAL_SECONDS,
  300,
);
const DEFAULT_CONTEXT_OWNER_ALIAS = process.env.THREEDVR_CONTEXT_HQ_OWNER_ALIAS
  || process.env.THREEDVR_PORTAL_ACCOUNT
  || '3dvr.tech@gmail.com';
const DEFAULT_HEARTBEAT_OWNER_ALIAS = process.env.THREEDVR_AGENT_OWNER_ALIAS || '3dvr-managed';

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeText(value) {
  return String(value || '').trim();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function countResult(result = {}) {
  return {
    imported: Array.isArray(result.imported) ? result.imported.length : 0,
    skipped: Array.isArray(result.skipped) ? result.skipped.length : 0,
  };
}

async function runSyncOnce(options = {}, runtime = {}) {
  const importContextHqImpl = runtime.importContextHqImpl || importContextHq;
  const syncLocalTaskHandoffsImpl = runtime.syncLocalTaskHandoffsImpl || syncLocalTaskHandoffs;
  const writeHeartbeatImpl = runtime.writeHeartbeatImpl || writeHeartbeat;
  const contextOwnerAlias = normalizeText(options.contextOwnerAlias || options.ownerAlias) || DEFAULT_CONTEXT_OWNER_ALIAS;
  const heartbeatOwnerAlias = normalizeText(options.heartbeatOwnerAlias) || DEFAULT_HEARTBEAT_OWNER_ALIAS;
  const taskOwnerAlias = normalizeText(options.taskOwnerAlias) || DEFAULT_TASK_OWNER;
  const memoryStateDir = statePaths(options).stateDir;
  const errors = [];

  let taskResult = { imported: [], skipped: [], scanned: 0 };
  try {
    taskResult = await syncLocalTaskHandoffsImpl({
      taskOwnerAlias,
      limit: options.taskLimit,
      stateDir: options.stateDir,
    });
  } catch (error) {
    errors.push(`local task handoffs: ${error.message || error}`);
  }

  let contextResult = { imported: [], skipped: [] };
  try {
    contextResult = await importContextHqImpl({
      ownerAlias: contextOwnerAlias,
      limit: options.limit,
      stateDir: options.stateDir,
    });
  } catch (error) {
    errors.push(`Context HQ: ${error.message || error}`);
  }

  const taskCounts = countResult(taskResult);
  const contextCounts = countResult(contextResult);
  const imported = taskCounts.imported + contextCounts.imported;
  const skipped = taskCounts.skipped + contextCounts.skipped;
  const ok = errors.length === 0;

  await writeHeartbeatImpl('organism-sync', {
    ownerAlias: heartbeatOwnerAlias,
    status: ok ? 'running' : 'degraded',
    metadata: {
      imported,
      skipped,
      taskImported: taskCounts.imported,
      taskSkipped: taskCounts.skipped,
      taskScanned: Number(taskResult.scanned || 0),
      contextImported: contextCounts.imported,
      contextSkipped: contextCounts.skipped,
      error: errors.join('; ').slice(0, 500),
      memoryStateDir,
    },
  }).catch(() => {});

  return {
    ok,
    contextOwnerAlias,
    heartbeatOwnerAlias,
    taskOwnerAlias,
    memoryStateDir,
    imported,
    skipped,
    taskImported: taskCounts.imported,
    taskSkipped: taskCounts.skipped,
    taskScanned: Number(taskResult.scanned || 0),
    contextImported: contextCounts.imported,
    contextSkipped: contextCounts.skipped,
    error: errors.join('; '),
  };
}

function renderReport(report = {}) {
  return `imported=${report.imported || 0} skipped=${report.skipped || 0} tasks=${report.taskImported || 0}/${report.taskScanned || 0} context=${report.contextImported || 0}`;
}

async function runSyncLoop(options = {}, runtime = {}) {
  const intervalSeconds = parsePositiveInteger(options.intervalSeconds, DEFAULT_INTERVAL_SECONDS);
  const sleepImpl = runtime.sleepImpl || sleep;
  for (;;) {
    const report = await runSyncOnce(options, runtime);
    if (report.ok) {
      console.log(`[organism-sync] ${renderReport(report)}`);
    } else {
      console.warn(`[organism-sync] ${renderReport(report)} degraded=${report.error}`);
    }
    await sleepImpl(intervalSeconds * 1000);
  }
}

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    once: false,
    intervalSeconds: DEFAULT_INTERVAL_SECONDS,
    contextOwnerAlias: '',
    heartbeatOwnerAlias: '',
    taskOwnerAlias: '',
    taskLimit: 100,
    stateDir: '',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--once') options.once = true;
    else if (arg === '--interval-seconds') options.intervalSeconds = parsePositiveInteger(argv[++index], DEFAULT_INTERVAL_SECONDS);
    else if (arg === '--owner' || arg === '--context-owner') options.contextOwnerAlias = argv[++index] || '';
    else if (arg === '--heartbeat-owner') options.heartbeatOwnerAlias = argv[++index] || '';
    else if (arg === '--task-owner') options.taskOwnerAlias = argv[++index] || '';
    else if (arg === '--task-limit') options.taskLimit = parsePositiveInteger(argv[++index], 100);
    else if (arg === '--state-dir') options.stateDir = argv[++index] || '';
    else throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.once) {
    const report = await runSyncOnce(options);
    if (report.ok) {
      console.log(`[organism-sync] ${renderReport(report)}`);
      return 0;
    }
    console.error(`[organism-sync] ${renderReport(report)} degraded=${report.error}`);
    return 1;
  }
  await runSyncLoop(options);
  return 0;
}

module.exports = {
  DEFAULT_CONTEXT_OWNER_ALIAS,
  DEFAULT_HEARTBEAT_OWNER_ALIAS,
  DEFAULT_INTERVAL_SECONDS,
  parseArgs,
  parsePositiveInteger,
  renderReport,
  runSyncLoop,
  runSyncOnce,
};

if (require.main === module) {
  main().then(code => {
    process.exit(code);
  }).catch(error => {
    console.error(`[organism-sync] ${error.message || error}`);
    process.exit(1);
  });
}

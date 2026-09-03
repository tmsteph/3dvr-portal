const { importContextHq, statePaths } = require('./digital-organism');
const { writeHeartbeat } = require('./agent-ops');

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

async function runSyncOnce(options = {}, runtime = {}) {
  const importContextHqImpl = runtime.importContextHqImpl || importContextHq;
  const writeHeartbeatImpl = runtime.writeHeartbeatImpl || writeHeartbeat;
  const contextOwnerAlias = normalizeText(options.contextOwnerAlias || options.ownerAlias) || DEFAULT_CONTEXT_OWNER_ALIAS;
  const heartbeatOwnerAlias = normalizeText(options.heartbeatOwnerAlias) || DEFAULT_HEARTBEAT_OWNER_ALIAS;
  const memoryStateDir = statePaths(options).stateDir;

  try {
    const result = await importContextHqImpl({
      ownerAlias: contextOwnerAlias,
      limit: options.limit,
      stateDir: options.stateDir,
    });
    await writeHeartbeatImpl('organism-sync', {
      ownerAlias: heartbeatOwnerAlias,
      status: 'running',
      metadata: {
        imported: result.imported.length,
        skipped: result.skipped.length,
        memoryStateDir,
      },
    }).catch(() => {});
    return {
      ok: true,
      contextOwnerAlias,
      heartbeatOwnerAlias,
      memoryStateDir,
      imported: result.imported.length,
      skipped: result.skipped.length,
      result,
    };
  } catch (error) {
    const message = error.message || String(error);
    await writeHeartbeatImpl('organism-sync', {
      ownerAlias: heartbeatOwnerAlias,
      status: 'degraded',
      metadata: {
        error: message.slice(0, 500),
        memoryStateDir,
      },
    }).catch(() => {});
    return {
      ok: false,
      contextOwnerAlias,
      heartbeatOwnerAlias,
      memoryStateDir,
      error: message,
    };
  }
}

async function runSyncLoop(options = {}, runtime = {}) {
  const intervalSeconds = parsePositiveInteger(options.intervalSeconds, DEFAULT_INTERVAL_SECONDS);
  const sleepImpl = runtime.sleepImpl || sleep;
  for (;;) {
    const report = await runSyncOnce(options, runtime);
    if (report.ok) {
      console.log(`[organism-sync] imported=${report.imported} skipped=${report.skipped}`);
    } else {
      console.warn(`[organism-sync] ${report.error}`);
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
    stateDir: '',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--once') options.once = true;
    else if (arg === '--interval-seconds') options.intervalSeconds = parsePositiveInteger(argv[++index], DEFAULT_INTERVAL_SECONDS);
    else if (arg === '--owner' || arg === '--context-owner') options.contextOwnerAlias = argv[++index] || '';
    else if (arg === '--heartbeat-owner') options.heartbeatOwnerAlias = argv[++index] || '';
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
      console.log(`[organism-sync] imported=${report.imported} skipped=${report.skipped}`);
      return 0;
    }
    console.error(`[organism-sync] ${report.error}`);
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
  runSyncLoop,
  runSyncOnce,
};

if (require.main === module) {
  main().then(code => {
    process.exitCode = code;
  }).catch(error => {
    console.error(`[organism-sync] ${error.message || error}`);
    process.exitCode = 1;
  });
}

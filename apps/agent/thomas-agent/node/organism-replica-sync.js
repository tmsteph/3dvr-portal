const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const {
  appendEvent,
  loadEvents,
} = require('./digital-organism');

const execFileAsync = promisify(execFile);
const DEFAULT_REMOTE = process.env.THREEDVR_ORGANISM_REPLICA_REMOTE || '3dvr-do';
const DEFAULT_REMOTE_LOG = process.env.THREEDVR_ORGANISM_REPLICA_LOG || '~/.3dvr/state/organism/memories.jsonl';

function normalizeText(value) {
  return String(value || '').trim();
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function parseEventLog(raw = '') {
  return String(raw || '')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`Invalid remote organism event at line ${index + 1}: ${error.message}`);
      }
    });
}

async function mergeRemoteEvents(remoteEvents = [], options = {}, runtime = {}) {
  const loadEventsImpl = runtime.loadEventsImpl || loadEvents;
  const appendEventImpl = runtime.appendEventImpl || appendEvent;
  const localEvents = await loadEventsImpl(options);
  const seen = new Set(localEvents.map(canonical));
  let imported = 0;
  let skipped = 0;

  for (const event of remoteEvents) {
    const fingerprint = canonical(event);
    if (seen.has(fingerprint)) {
      skipped += 1;
      continue;
    }
    await appendEventImpl(event, options);
    seen.add(fingerprint);
    imported += 1;
  }

  return {
    remoteEvents: remoteEvents.length,
    localEventsBefore: localEvents.length,
    imported,
    skipped,
  };
}

async function fetchRemoteEvents(options = {}, runtime = {}) {
  const execFileImpl = runtime.execFileImpl || execFileAsync;
  const remote = normalizeText(options.remote) || DEFAULT_REMOTE;
  const remoteLog = normalizeText(options.remoteLog) || DEFAULT_REMOTE_LOG;
  const command = `if test -s ${remoteLog}; then cat ${remoteLog}; fi`;
  const result = await execFileImpl('ssh', [
    '-o', 'BatchMode=yes',
    '-o', 'ConnectTimeout=8',
    remote,
    command,
  ], { maxBuffer: 16 * 1024 * 1024 });
  return parseEventLog(result.stdout || '');
}

async function syncReplicaOnce(options = {}, runtime = {}) {
  const fetchRemoteEventsImpl = runtime.fetchRemoteEventsImpl || fetchRemoteEvents;
  const remoteEvents = await fetchRemoteEventsImpl(options, runtime);
  return mergeRemoteEvents(remoteEvents, options, runtime);
}

function parseArgs(argv = process.argv.slice(2)) {
  const options = { evaluate: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--remote') options.remote = argv[++index] || '';
    else if (arg === '--remote-log') options.remoteLog = argv[++index] || '';
    else if (arg === '--state-dir') options.stateDir = argv[++index] || '';
    else if (arg === '--evaluate') options.evaluate = true;
    else throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

function renderTournament(tournament = {}) {
  const lines = [`winner=${tournament.winner || 'none'}`];
  const evidence = tournament.evidence || {};
  lines.push(`cases=${evidence.caseCount || 0} highQuality=${evidence.highQualityCount || 0}`);
  for (const result of tournament.results || []) {
    lines.push(`${result.strategy}:mrr=${Number(result.mrr || 0).toFixed(3)},hit@1=${Number(result.hitAt1 || 0).toFixed(3)}`);
  }
  if (tournament.promotion) lines.push(`promoted=${tournament.promotion.strategy}`);
  if (tournament.promotionBlocked) lines.push(`promotionBlocked=${tournament.promotionBlocked}`);
  return lines.join(' ');
}

async function cli(argv = process.argv.slice(2), runtime = {}) {
  const options = parseArgs(argv);
  const report = await syncReplicaOnce(options, runtime);
  console.log(`Organism replica: imported=${report.imported} skipped=${report.skipped} remote=${report.remoteEvents} localBefore=${report.localEventsBefore}`);
  if (options.evaluate) {
    const runRealTournamentImpl = runtime.runRealTournamentImpl || require('./retrieval-lab').runRealTournament;
    const tournament = await runRealTournamentImpl({ ...options, promote: true });
    console.log(`Organism retrieval: ${renderTournament(tournament)}`);
  }
  return 0;
}

module.exports = {
  canonical,
  cli,
  fetchRemoteEvents,
  mergeRemoteEvents,
  parseArgs,
  parseEventLog,
  renderTournament,
  syncReplicaOnce,
};

if (require.main === module) {
  cli().then(code => process.exit(code)).catch((error) => {
    console.error(`[organism-replica] ${error.message || error}`);
    process.exit(1);
  });
}

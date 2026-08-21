const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { writeHeartbeat } = require('./agent-ops');

const ROOT = path.join(__dirname, '..');
const SCRIPTS = path.join(ROOT, 'scripts');
const STATE_DIR = process.env.THREEDVR_AUTOPILOT_STATE_DIR || path.join(ROOT, 'state');
const DESIRED_STATE_FILE = process.env.THREEDVR_AGENT_DESIRED_STATE_FILE || path.join(STATE_DIR, 'agent-desired-state');
const INTERVAL_SECONDS = parseInteger(process.env.THREEDVR_AGENT_SUPERVISOR_INTERVAL_SECONDS, 30);
const FAILURE_THRESHOLD = parseInteger(process.env.THREEDVR_AGENT_SUPERVISOR_FAILURE_THRESHOLD, 2);
const RESTART_COOLDOWN_SECONDS = parseInteger(process.env.THREEDVR_AGENT_SUPERVISOR_RESTART_COOLDOWN_SECONDS, 300);
const OWNER_ALIAS = process.env.THREEDVR_AGENT_OWNER_ALIAS || '3dvr-managed';

const SERVICES = [
  { name: 'inbox', script: 'ask-inbox-daemon' },
  { name: 'outreach', script: 'ask-autopilot-daemon' },
  { name: 'worker-router', script: 'ask-agent-worker-daemon' },
  { name: 'heartbeat', script: 'ask-agent-heartbeat-daemon' },
];

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readDesiredState(file = DESIRED_STATE_FILE) {
  try {
    return String(fs.readFileSync(file, 'utf8')).trim().toLowerCase();
  } catch {
    return 'stopped';
  }
}

function runDaemon(service, command, options = {}) {
  const script = options.scriptPath || path.join(SCRIPTS, service.script);
  const result = (options.spawnSyncImpl || spawnSync)(script, [command], {
    cwd: ROOT,
    env: process.env,
    stdio: options.stdio || 'pipe',
    encoding: 'utf8',
  });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: String(result.stdout || '').trim(),
    stderr: String(result.stderr || '').trim(),
  };
}

function makeSupervisorState() {
  return {
    failures: new Map(),
    lastRestartAt: new Map(),
  };
}

async function runSupervisorCycle(options = {}) {
  const now = options.now || Date.now();
  const state = options.state || makeSupervisorState();
  const desired = options.desiredState || readDesiredState(options.desiredStateFile);
  const services = options.services || SERVICES;
  const runDaemonImpl = options.runDaemonImpl || runDaemon;

  if (desired !== 'running') {
    for (const service of services) state.failures.set(service.name, 0);
    return { desired, repaired: [], unhealthy: [], state };
  }

  const unhealthy = [];
  const repaired = [];

  for (const service of services) {
    const status = runDaemonImpl(service, 'status', options);
    if (status.ok) {
      state.failures.set(service.name, 0);
      continue;
    }

    const failures = (state.failures.get(service.name) || 0) + 1;
    state.failures.set(service.name, failures);
    unhealthy.push({ name: service.name, failures });

    const lastRestartAt = state.lastRestartAt.get(service.name) || 0;
    const cooldownMs = (options.restartCooldownSeconds || RESTART_COOLDOWN_SECONDS) * 1000;
    const threshold = options.failureThreshold || FAILURE_THRESHOLD;
    if (failures < threshold || now - lastRestartAt < cooldownMs) continue;

    const restart = runDaemonImpl(service, 'start', options);
    state.lastRestartAt.set(service.name, now);
    if (restart.ok) {
      state.failures.set(service.name, 0);
      repaired.push(service.name);
    }
  }

  return { desired, repaired, unhealthy, state };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const state = makeSupervisorState();
  console.log(`[agent-supervisor] alive; interval=${INTERVAL_SECONDS}s threshold=${FAILURE_THRESHOLD} cooldown=${RESTART_COOLDOWN_SECONDS}s`);

  for (;;) {
    const report = await runSupervisorCycle({ state });
    if (report.repaired.length) {
      console.log(`[agent-supervisor] repaired: ${report.repaired.join(', ')}`);
    }
    await writeHeartbeat('agent-supervisor', {
      ownerAlias: OWNER_ALIAS,
      status: report.desired === 'running' ? 'running' : 'stopped',
      metadata: {
        desiredState: report.desired,
        repaired: report.repaired.join(','),
        unhealthy: report.unhealthy.map(item => `${item.name}:${item.failures}`).join(','),
        failureThreshold: FAILURE_THRESHOLD,
        restartCooldownSeconds: RESTART_COOLDOWN_SECONDS,
      },
    }).catch(error => {
      console.warn(`[agent-supervisor] heartbeat skipped: ${error.message || error}`);
    });
    await sleep(INTERVAL_SECONDS * 1000);
  }
}

module.exports = {
  SERVICES,
  makeSupervisorState,
  readDesiredState,
  runDaemon,
  runSupervisorCycle,
};

if (require.main === module) {
  main().catch(error => {
    console.error(`[agent-supervisor] ${error.message || error}`);
    process.exit(1);
  });
}

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { existsSync, mkdtempSync, rmSync, readFileSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

const {
  SERVICES,
  makeSupervisorState,
  runSupervisorCycle,
  supervisorHeartbeatStatus,
} = require('../thomas-agent/node/agent-supervisor');

const services = [
  { name: 'inbox', script: 'ask-inbox-daemon' },
  { name: 'worker-router', script: 'ask-agent-worker-daemon' },
];

test('default supervisor owns the context router and organism memory sync', () => {
  assert.ok(SERVICES.some(service => service.script === 'ask-context-task-router-daemon'));
  assert.ok(SERVICES.some(service => service.script === 'ask-organism-sync-daemon'));
});

test('supervisor does nothing when desired state is stopped', async () => {
  let calls = 0;
  const report = await runSupervisorCycle({
    desiredState: 'stopped',
    services,
    runDaemonImpl: () => {
      calls += 1;
      return { ok: false };
    },
  });

  assert.equal(calls, 0);
  assert.deepEqual(report.repaired, []);
  assert.deepEqual(report.unhealthy, []);
});

test('one missed health check is observed but not restarted', async () => {
  const state = makeSupervisorState();
  const commands = [];
  const report = await runSupervisorCycle({
    desiredState: 'running',
    services,
    state,
    failureThreshold: 2,
    runDaemonImpl: (service, command) => {
      commands.push(`${service.name}:${command}`);
      return { ok: service.name !== 'inbox' };
    },
  });

  assert.deepEqual(report.repaired, []);
  assert.deepEqual(report.unhealthy, [{ name: 'inbox', failures: 1 }]);
  assert.deepEqual(commands, ['inbox:status', 'worker-router:status']);
});

test('second consecutive failure repairs one crashed service', async () => {
  const state = makeSupervisorState();
  const calls = [];
  const runDaemonImpl = (service, command) => {
    calls.push(`${service.name}:${command}`);
    if (service.name === 'inbox' && command === 'status') return { ok: false };
    return { ok: true };
  };

  await runSupervisorCycle({
    desiredState: 'running',
    services,
    state,
    now: 10_000,
    failureThreshold: 2,
    restartCooldownSeconds: 300,
    runDaemonImpl,
  });
  const report = await runSupervisorCycle({
    desiredState: 'running',
    services,
    state,
    now: 40_000,
    failureThreshold: 2,
    restartCooldownSeconds: 300,
    runDaemonImpl,
  });

  assert.deepEqual(report.repaired, ['inbox']);
  assert.ok(calls.includes('inbox:start'));
  assert.equal(state.failures.get('inbox'), 0);
});

test('restart cooldown prevents a repair storm', async () => {
  const state = makeSupervisorState();
  state.failures.set('inbox', 1);
  state.lastRestartAt.set('inbox', 100_000);
  const calls = [];

  const report = await runSupervisorCycle({
    desiredState: 'running',
    services: [services[0]],
    state,
    now: 150_000,
    failureThreshold: 2,
    restartCooldownSeconds: 300,
    runDaemonImpl: (service, command) => {
      calls.push(`${service.name}:${command}`);
      return { ok: false };
    },
  });

  assert.deepEqual(report.repaired, []);
  assert.deepEqual(calls, ['inbox:status']);
  assert.equal(state.failures.get('inbox'), 2);
});

test('healthy service clears its failure streak', async () => {
  const state = makeSupervisorState();
  state.failures.set('worker-router', 1);

  const report = await runSupervisorCycle({
    desiredState: 'running',
    services: [services[1]],
    state,
    runDaemonImpl: () => ({ ok: true }),
  });

  assert.deepEqual(report.unhealthy, []);
  assert.equal(state.failures.get('worker-router'), 0);
});

test('signed one-task canary cannot restart unrelated supervisor services', async () => {
  const calls = [];
  const report = await runSupervisorCycle({
    desiredState: 'running',
    services,
    onlyTaskId: 'signed-test-task',
    failureThreshold: 1,
    runDaemonImpl: (service, command) => {
      calls.push(`${service.name}:${command}`);
      return { ok: false };
    },
  });

  assert.deepEqual(calls, [], 'pinned supervisor must not inspect or start daemons');
  assert.deepEqual(report.repaired, []);
  assert.equal(report.blocked, 'signed-task-pin-forbids-supervisor-repair');
});

test('supervisor heartbeat reports degraded rather than healthy when desired services fail', async () => {
  const healthy = await runSupervisorCycle({
    desiredState: 'running',
    services,
    runDaemonImpl: () => ({ ok: true }),
  });
  assert.equal(supervisorHeartbeatStatus(healthy), 'running');

  const unhealthy = await runSupervisorCycle({
    desiredState: 'running',
    services,
    runDaemonImpl: service => ({ ok: service.name !== 'worker-router' }),
  });
  assert.equal(supervisorHeartbeatStatus(unhealthy), 'degraded');

  const stopped = await runSupervisorCycle({
    desiredState: 'stopped',
    services,
    runDaemonImpl: () => { throw Error('stopped supervisor must not probe'); },
  });
  assert.equal(supervisorHeartbeatStatus(stopped), 'stopped');

  const pinned = await runSupervisorCycle({
    desiredState: 'running',
    services,
    onlyTaskId: 'signed-test-task',
    runDaemonImpl: () => { throw Error('pinned supervisor must not probe'); },
  });
  assert.equal(supervisorHeartbeatStatus(pinned), 'blocked');
});

test('pinned supervisor startup rejects before changing desired state', () => {
  const stateDir = mkdtempSync(join(tmpdir(), '3dvr-supervisor-pin-'));
  try {
    const script = join(__dirname, '../thomas-agent/scripts/ask-agent-supervisor-daemon');
    const result = spawnSync('bash', [script, 'start'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        THREEDVR_AUTOPILOT_STATE_DIR: stateDir,
        THREEDVR_AGENT_WORKER_ONLY_TASK_ID: 'signed-test-task',
      },
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /pinned task mode forbids supervisor startup/i);
    assert.equal(existsSync(join(stateDir, 'agent-desired-state')), false);
  } finally {
    rmSync(stateDir, { recursive: true, force: true });
  }
});

test('supervisor startup refuses a dead tmux session and clears stale desired state', () => {
  const stateDir = mkdtempSync(join(tmpdir(), '3dvr-supervisor-start-'));
  try {
    const script = join(__dirname, '../thomas-agent/scripts/ask-agent-supervisor-daemon');
    const fakeTmux = join(stateDir, 'tmux');
    writeFileSync(fakeTmux, [
      '#!/usr/bin/env bash',
      'case "$1" in',
      '  has-session) exit 1 ;;',
      '  new-session) exit 0 ;;',
      '  *) exit 1 ;;',
      'esac',
      '',
    ].join('\n'), { mode: 0o755 });
    writeFileSync(join(stateDir, 'agent-desired-state'), 'running\n');
    const result = spawnSync('bash', [script, 'start'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: stateDir + ':' + process.env.PATH,
        THREEDVR_AUTOPILOT_STATE_DIR: stateDir,
        THREEDVR_AGENT_WORKER_ONLY_TASK_ID: '',
      },
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /supervisor exited during startup/i);
    assert.equal(readFileSync(join(stateDir, 'agent-desired-state'), 'utf8').trim(), 'stopped');
    assert.doesNotMatch(result.stdout, /started agent supervisor/i);
  } finally {
    rmSync(stateDir, { recursive: true, force: true });
  }
});

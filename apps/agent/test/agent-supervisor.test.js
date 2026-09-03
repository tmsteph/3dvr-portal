const test = require('node:test');
const assert = require('node:assert/strict');

const {
  SERVICES,
  makeSupervisorState,
  runSupervisorCycle,
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

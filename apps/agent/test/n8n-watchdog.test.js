const assert = require('node:assert/strict');
const test = require('node:test');

const {
  evaluateN8nWatchdog,
} = require('../connectors/control/n8n-watchdog');

const policy = {
  target: 'test',
  expectedTotalWorkflows: 3,
  expectedActiveWorkflows: 3,
  workflows: [
    { name: 'Daily', mode: 'scheduled', maxSilenceHours: 26, impact: 'daily work' },
    { name: 'Intake', mode: 'event', impact: 'intake' },
  ],
};

function workflows() {
  return [
    { id: '1', name: 'Daily', active: true, isArchived: false },
    { id: '2', name: 'Intake', active: true, isArchived: false },
    { id: '3', name: 'Other', active: true, isArchived: false },
  ];
}

test('watchdog accepts a healthy scheduled baseline', () => {
  const result = evaluateN8nWatchdog({
    workflows: workflows(),
    executionsByWorkflow: {
      1: [{ id: 'e1', workflowId: '1', status: 'success', startedAt: '2026-09-28T10:00:00Z', stoppedAt: '2026-09-28T10:01:00Z' }],
    },
    now: new Date('2026-09-28T12:00:00Z'),
    policy,
  });

  assert.deepEqual(result.findings, []);
  assert.equal(result.baseline.actualTotalWorkflows, 3);
  assert.equal(result.baseline.actualActiveWorkflows, 3);
  assert.equal(result.blindSpot.code, 'success-no-op');
});

test('watchdog detects count drift and stale scheduled execution', () => {
  const rows = workflows().slice(0, 2);
  const result = evaluateN8nWatchdog({
    workflows: rows,
    executionsByWorkflow: {
      1: [{ id: 'e1', workflowId: '1', status: 'success', startedAt: '2026-09-25T10:00:00Z', stoppedAt: '2026-09-25T10:01:00Z' }],
    },
    now: new Date('2026-09-28T12:00:00Z'),
    policy,
  });

  assert.equal(result.findings.some((row) => row.code === 'workflow-count-total'), true);
  assert.equal(result.findings.some((row) => row.code === 'workflow-count-active'), true);
  assert.equal(result.findings.some((row) => row.code === 'scheduled-stale'), true);
});

test('watchdog reports the latest scheduled error', () => {
  const result = evaluateN8nWatchdog({
    workflows: workflows(),
    executionsByWorkflow: {
      1: [{ id: 'e2', workflowId: '1', status: 'error', startedAt: '2026-09-28T11:00:00Z', stoppedAt: '2026-09-28T11:01:00Z' }],
    },
    now: new Date('2026-09-28T12:00:00Z'),
    policy,
  });

  assert.equal(result.findings.some((row) => row.code === 'latest-execution-error'), true);
});

test('event workflows are marked for heartbeat monitoring without false inactivity alarms', () => {
  const result = evaluateN8nWatchdog({
    workflows: workflows(),
    executionsByWorkflow: {
      1: [{ id: 'e1', workflowId: '1', status: 'success', startedAt: '2026-09-28T11:00:00Z', stoppedAt: '2026-09-28T11:01:00Z' }],
    },
    now: new Date('2026-09-28T12:00:00Z'),
    policy,
  });

  const intake = result.monitored.find((row) => row.workflow === 'Intake');
  assert.equal(intake.heartbeatRequired, true);
  assert.match(intake.reason, /successful no-op/);
  assert.equal(result.findings.some((row) => row.workflow === 'Intake'), false);
});

test('missing monitored workflow is a high-severity finding', () => {
  const result = evaluateN8nWatchdog({
    workflows: workflows().filter((row) => row.name !== 'Intake'),
    executionsByWorkflow: {
      1: [{ id: 'e1', workflowId: '1', status: 'success', startedAt: '2026-09-28T11:00:00Z', stoppedAt: '2026-09-28T11:01:00Z' }],
    },
    now: new Date('2026-09-28T12:00:00Z'),
    policy,
  });

  const missing = result.findings.find((row) => row.code === 'workflow-missing');
  assert.equal(missing.severity, 'high');
  assert.equal(missing.workflow, 'Intake');
});


test('manual and retry runs do not mask a stale schedule', () => {
  const result = evaluateN8nWatchdog({
    workflows: workflows(),
    executionsByWorkflow: {
      1: [
        { id: 'scheduled-old', workflowId: '1', status: 'success', mode: 'trigger', startedAt: '2026-09-25T10:00:00Z', stoppedAt: '2026-09-25T10:01:00Z' },
        { id: 'manual-new', workflowId: '1', status: 'success', mode: 'manual', startedAt: '2026-09-28T11:30:00Z', stoppedAt: '2026-09-28T11:31:00Z' },
        { id: 'retry-new', workflowId: '1', status: 'success', mode: 'retry', startedAt: '2026-09-28T11:40:00Z', stoppedAt: '2026-09-28T11:41:00Z' },
      ],
    },
    now: new Date('2026-09-28T12:00:00Z'),
    policy,
  });

  const stale = result.findings.find((row) => row.code === 'scheduled-stale');
  assert.equal(Boolean(stale), true);
  assert.equal(stale.latestExecution.id, 'scheduled-old');
});

test('schedule freshness is measured from invocation start, not recent completion', () => {
  const result = evaluateN8nWatchdog({
    workflows: workflows(),
    executionsByWorkflow: {
      1: [{
        id: 'hung-run',
        workflowId: '1',
        status: 'success',
        mode: 'trigger',
        startedAt: '2026-09-25T10:00:00Z',
        stoppedAt: '2026-09-28T11:59:00Z',
      }],
    },
    now: new Date('2026-09-28T12:00:00Z'),
    policy,
  });

  assert.equal(result.findings.some((row) => row.code === 'scheduled-stale'), true);
});

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  importTaskHandoffsFromTasks,
  isSyntheticProbe,
  syncLocalTaskHandoffs,
  taskSessionsFromTasks,
} = require('../thomas-agent/node/task-memory-sync');

test('task memory compiler keeps raw output out and ignores synthetic probes', () => {
  const tasks = [
    {
      id: 'real-task',
      task: 'Ship the portal fix',
      status: 'completed',
      backend: 'codex',
      resultSummary: 'UNTRUSTED MODEL OUTPUT should never become memory',
      updatedAt: '2026-09-05T12:00:00.000Z',
      riskClass: 'workspace_write',
    },
    {
      id: 'probe',
      task: 'DigitalOcean worker health check',
      status: 'completed',
      backend: 'health',
      updatedAt: '2026-09-05T12:01:00.000Z',
    },
  ];

  const sessions = taskSessionsFromTasks(tasks);
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].id, 'task-handoff-real-task');
  assert.match(sessions[0].summary, /Completed agent task: Ship the portal fix/);
  assert.doesNotMatch(JSON.stringify(sessions), /UNTRUSTED MODEL OUTPUT/);
  assert.equal(isSyntheticProbe(tasks[1]), true);
});

test('task handoffs import through the existing provenance-aware Context HQ memory path', async () => {
  let observedSessions = [];
  const result = await importTaskHandoffsFromTasks([{
    id: 'failed-task',
    task: 'Apply a small UI patch',
    status: 'failed',
    backend: 'codex',
    updatedAt: '2026-09-05T12:00:00.000Z',
  }], {}, {
    importContextSessionsImpl: async (sessions) => {
      observedSessions = sessions;
      return { imported: [{ id: 'memory-1' }], skipped: [] };
    },
  });

  assert.equal(result.scanned, 1);
  assert.equal(result.imported.length, 1);
  assert.match(observedSessions[0].openLoops, /decide whether to retry/);
});

test('local task sync explicitly reads the SQLite managed queue', async () => {
  let observedOptions;
  const report = await syncLocalTaskHandoffs({ taskOwnerAlias: '3dvr-managed' }, {
    listTasksImpl: async (options) => {
      observedOptions = options;
      return [];
    },
    importContextSessionsImpl: async () => ({ imported: [], skipped: [] }),
  });

  assert.equal(observedOptions.ownerAlias, '3dvr-managed');
  assert.equal(observedOptions.queueStore, 'sqlite');
  assert.equal(report.scanned, 0);
});

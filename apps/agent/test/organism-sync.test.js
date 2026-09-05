const test = require('node:test');
const assert = require('node:assert/strict');

const {
  parseArgs,
  parsePositiveInteger,
  runSyncOnce,
} = require('../thomas-agent/node/organism-sync');

test('organism sync imports safe local task handoffs plus Context HQ and reports only counts', async () => {
  let importOptions;
  let taskOptions;
  let heartbeat;
  const report = await runSyncOnce({
    contextOwnerAlias: 'founder@example.com',
    heartbeatOwnerAlias: '3dvr-managed',
    taskOwnerAlias: 'managed-worker',
    stateDir: '/tmp/organism-test',
  }, {
    syncLocalTaskHandoffsImpl: async (options) => {
      taskOptions = options;
      return {
        scanned: 2,
        imported: [{ id: 'private-task-memory', content: 'private memory body' }],
        skipped: [{ id: 'old-task' }],
      };
    },
    importContextHqImpl: async (options) => {
      importOptions = options;
      return {
        imported: [{ id: 'private-context-memory', content: 'other private body' }],
        skipped: [],
      };
    },
    writeHeartbeatImpl: async (name, payload) => {
      heartbeat = { name, payload };
    },
  });

  assert.equal(report.ok, true);
  assert.equal(report.imported, 2);
  assert.equal(report.skipped, 1);
  assert.equal(report.taskImported, 1);
  assert.equal(report.taskScanned, 2);
  assert.equal(report.contextImported, 1);
  assert.equal(importOptions.ownerAlias, 'founder@example.com');
  assert.equal(taskOptions.taskOwnerAlias, 'managed-worker');
  assert.equal(taskOptions.stateDir, '/tmp/organism-test');
  assert.equal(heartbeat.name, 'organism-sync');
  assert.equal(heartbeat.payload.ownerAlias, '3dvr-managed');
  assert.equal(heartbeat.payload.metadata.taskImported, 1);
  assert.equal(heartbeat.payload.metadata.contextImported, 1);
  assert.equal(JSON.stringify(heartbeat).includes('private memory body'), false);
  assert.equal(JSON.stringify(heartbeat).includes('other private body'), false);
});

test('organism sync preserves local task ingestion when Context HQ is degraded', async () => {
  let heartbeat;
  const report = await runSyncOnce({
    stateDir: '/tmp/organism-test',
  }, {
    syncLocalTaskHandoffsImpl: async () => ({
      scanned: 1,
      imported: [{ id: 'task-memory' }],
      skipped: [],
    }),
    importContextHqImpl: async () => {
      throw new Error('relay unavailable');
    },
    writeHeartbeatImpl: async (name, payload) => {
      heartbeat = { name, payload };
    },
  });

  assert.equal(report.ok, false);
  assert.equal(report.taskImported, 1);
  assert.match(report.error, /relay unavailable/);
  assert.equal(heartbeat.payload.status, 'degraded');
  assert.equal(heartbeat.payload.metadata.taskImported, 1);
});

test('organism sync degrades if local managed-task capture fails', async () => {
  const report = await runSyncOnce({}, {
    syncLocalTaskHandoffsImpl: async () => {
      throw new Error('sqlite unavailable');
    },
    importContextHqImpl: async () => ({ imported: [], skipped: [] }),
    writeHeartbeatImpl: async () => {},
  });

  assert.equal(report.ok, false);
  assert.match(report.error, /sqlite unavailable/);
});

test('organism sync CLI parsing keeps memory source owners distinct', () => {
  const options = parseArgs([
    '--once',
    '--interval-seconds', '45',
    '--context-owner', 'founder@example.com',
    '--heartbeat-owner', '3dvr-managed',
    '--task-owner', 'managed-worker',
    '--task-limit', '75',
    '--state-dir', '/tmp/memory',
  ]);

  assert.equal(options.once, true);
  assert.equal(options.intervalSeconds, 45);
  assert.equal(options.contextOwnerAlias, 'founder@example.com');
  assert.equal(options.heartbeatOwnerAlias, '3dvr-managed');
  assert.equal(options.taskOwnerAlias, 'managed-worker');
  assert.equal(options.taskLimit, 75);
  assert.equal(options.stateDir, '/tmp/memory');
  assert.equal(parsePositiveInteger('0', 300), 300);
  assert.equal(parsePositiveInteger('not-a-number', 300), 300);
});

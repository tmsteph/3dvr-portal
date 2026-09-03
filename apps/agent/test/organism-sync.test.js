const test = require('node:test');
const assert = require('node:assert/strict');

const {
  parseArgs,
  parsePositiveInteger,
  runSyncOnce,
} = require('../thomas-agent/node/organism-sync');

test('organism sync imports Context HQ handoffs and reports only counts', async () => {
  let importOptions;
  let heartbeat;
  const report = await runSyncOnce({
    contextOwnerAlias: 'founder@example.com',
    heartbeatOwnerAlias: '3dvr-managed',
    stateDir: '/tmp/organism-test',
  }, {
    importContextHqImpl: async (options) => {
      importOptions = options;
      return {
        imported: [{ id: 'private-memory-id', content: 'private memory body' }],
        skipped: [{ id: 'old-session', reason: 'already-imported' }],
      };
    },
    writeHeartbeatImpl: async (name, payload) => {
      heartbeat = { name, payload };
    },
  });

  assert.equal(report.ok, true);
  assert.equal(report.imported, 1);
  assert.equal(report.skipped, 1);
  assert.equal(report.contextOwnerAlias, 'founder@example.com');
  assert.equal(report.heartbeatOwnerAlias, '3dvr-managed');
  assert.equal(importOptions.ownerAlias, 'founder@example.com');
  assert.equal(importOptions.stateDir, '/tmp/organism-test');
  assert.equal(heartbeat.name, 'organism-sync');
  assert.equal(heartbeat.payload.ownerAlias, '3dvr-managed');
  assert.equal(heartbeat.payload.metadata.imported, 1);
  assert.equal(heartbeat.payload.metadata.skipped, 1);
  assert.equal(JSON.stringify(heartbeat).includes('private memory body'), false);
});

test('organism sync degrades without crashing the long-running service', async () => {
  let heartbeat;
  const report = await runSyncOnce({
    contextOwnerAlias: 'founder@example.com',
    heartbeatOwnerAlias: '3dvr-managed',
    stateDir: '/tmp/organism-test',
  }, {
    importContextHqImpl: async () => {
      throw new Error('relay unavailable');
    },
    writeHeartbeatImpl: async (name, payload) => {
      heartbeat = { name, payload };
    },
  });

  assert.equal(report.ok, false);
  assert.match(report.error, /relay unavailable/);
  assert.equal(heartbeat.payload.ownerAlias, '3dvr-managed');
  assert.equal(heartbeat.payload.status, 'degraded');
});

test('organism sync CLI parsing keeps context and heartbeat owners distinct', () => {
  const options = parseArgs([
    '--once',
    '--interval-seconds', '45',
    '--context-owner', 'founder@example.com',
    '--heartbeat-owner', '3dvr-managed',
    '--state-dir', '/tmp/memory',
  ]);

  assert.equal(options.once, true);
  assert.equal(options.intervalSeconds, 45);
  assert.equal(options.contextOwnerAlias, 'founder@example.com');
  assert.equal(options.heartbeatOwnerAlias, '3dvr-managed');
  assert.equal(options.stateDir, '/tmp/memory');
  assert.equal(parsePositiveInteger('0', 300), 300);
  assert.equal(parsePositiveInteger('not-a-number', 300), 300);
});

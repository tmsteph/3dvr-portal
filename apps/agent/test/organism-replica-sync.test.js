const test = require('node:test');
const assert = require('node:assert/strict');

const {
  canonical,
  mergeRemoteEvents,
  parseEventLog,
  syncReplicaOnce,
} = require('../thomas-agent/node/organism-replica-sync');

test('canonical fingerprint ignores object key order', () => {
  assert.equal(
    canonical({ b: 2, a: { y: 2, x: 1 } }),
    canonical({ a: { x: 1, y: 2 }, b: 2 }),
  );
});

test('replica merge appends only missing events and preserves local-only history', async () => {
  const local = [
    { type: 'remember', memory: { id: 'shared', content: 'shared' } },
    { type: 'retrieval-feedback', outcome: 'approved', query: 'local query', memoryId: 'shared' },
  ];
  const appended = [];
  const remote = [
    { memory: { content: 'shared', id: 'shared' }, type: 'remember' },
    { type: 'correct', memoryId: 'shared', memory: { id: 'replacement', content: 'new' } },
  ];

  const report = await mergeRemoteEvents(remote, {}, {
    loadEventsImpl: async () => local,
    appendEventImpl: async event => appended.push(event),
  });

  assert.equal(report.imported, 1);
  assert.equal(report.skipped, 1);
  assert.equal(appended.length, 1);
  assert.equal(appended[0].type, 'correct');
  assert.equal(local.some(event => event.type === 'retrieval-feedback'), true);
});

test('replica sync never needs to expose remote memory bodies in its report', async () => {
  const report = await syncReplicaOnce({}, {
    fetchRemoteEventsImpl: async () => [
      { type: 'remember', memory: { id: 'private', content: 'do not log me' } },
    ],
    loadEventsImpl: async () => [],
    appendEventImpl: async () => {},
  });

  assert.deepEqual(report, {
    remoteEvents: 1,
    localEventsBefore: 0,
    imported: 1,
    skipped: 0,
  });
  assert.equal(JSON.stringify(report).includes('do not log me'), false);
});

test('remote JSONL parser validates every event line', () => {
  const events = parseEventLog('{"type":"remember"}\n{"type":"forget","memoryId":"x"}\n');
  assert.equal(events.length, 2);
  assert.throws(() => parseEventLog('{bad json}\n'), /line 1/);
});

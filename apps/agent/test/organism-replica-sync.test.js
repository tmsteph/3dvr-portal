const test = require('node:test');
const assert = require('node:assert/strict');

const {
  canonical,
  cli,
  mergeRemoteEvents,
  parseEventLog,
  renderTournament,
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

test('replica CLI can run the gated tournament without logging case contents', async () => {
  const writes = [];
  const originalLog = console.log;
  console.log = line => writes.push(String(line));
  try {
    await cli(['--evaluate'], {
      fetchRemoteEventsImpl: async () => [],
      loadEventsImpl: async () => [],
      appendEventImpl: async () => {},
      runRealTournamentImpl: async () => ({
        winner: 'baseline-jaccard',
        evidence: { caseCount: 3, highQualityCount: 1 },
        results: [{ strategy: 'baseline-jaccard', mrr: 1, hitAt1: 1 }],
        promotionBlocked: 'incumbent retained',
        privateCaseBody: 'never log this',
      }),
    });
  } finally {
    console.log = originalLog;
  }

  const output = writes.join('\n');
  assert.match(output, /winner=baseline-jaccard/);
  assert.match(output, /cases=3 highQuality=1/);
  assert.doesNotMatch(output, /never log this/);
});

test('tournament renderer stays aggregate-only', () => {
  const rendered = renderTournament({
    winner: 'query-coverage',
    evidence: { caseCount: 4, highQualityCount: 1 },
    results: [{ strategy: 'query-coverage', mrr: 0.8, hitAt1: 0.75, cases: [{ query: 'private' }] }],
  });
  assert.match(rendered, /query-coverage:mrr=0.800,hit@1=0.750/);
  assert.doesNotMatch(rendered, /private/);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const { makeProcessor } = require('../thomas-agent/node/inbox-monitor-loop');

async function until(predicate) {
  for (let i = 0; i < 60; i += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail('timed out waiting for processor');
}

test('blocked free-site fulfillment never blocks later inbox events or starts overlapping fulfillment', async () => {
  const reasons = [];
  let started = 0;
  let failureReports = 0;
  let releaseWorker;
  const unresolved = new Promise((resolve) => { releaseWorker = resolve; });
  const processInbox = makeProcessor({
    debounceMs: 0,
    runInbox: async (reason) => { reasons.push(reason); return { ok: true }; },
    runFreeSite: () => { started += 1; return started === 1 ? unresolved : Promise.resolve({ ok: true }); },
    reportFailure: async () => { failureReports += 1; },
  });

  processInbox('startup');
  await until(() => reasons.length === 1 && started === 1);
  processInbox('new-message');
  await until(() => reasons.length === 2);
  assert.deepEqual(reasons, ['startup', 'new-message']);
  assert.equal(started, 1, 'uncertain fulfillment must not be replayed');
  assert.equal(failureReports, 0, 'slow job must not report a failure');
  processInbox('reconnect-startup');
  await until(() => reasons.length === 3);
  assert.equal(started, 1, 'coalesced events must not overlap the first worker');
  releaseWorker({ ok: true });
  await until(() => started === 2);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(started, 2, 'exactly one pending scan after successful completion');
  assert.equal(failureReports, 0);
});

test('completed failed free-site work reports the failure once without blocking inbox', async () => {
  const reasons = [];
  let reported = 0;
  const processInbox = makeProcessor({
    debounceMs: 0,
    runInbox: async (reason) => { reasons.push(reason); return { ok: true }; },
    runFreeSite: async () => ({ ok: false }),
    reportFailure: async () => { reported += 1; },
  });
  processInbox('startup');
  await until(() => reported === 1);
  assert.deepEqual(reasons, ['startup']);
  assert.equal(reported, 1);
});

test('pending events do not trigger a local retry immediately after failed fulfillment', async () => {
  let started = 0;
  let reported = 0;
  let release;
  let inboxCount = 0;
  const blocked = new Promise((resolve) => { release = resolve; });
  const processInbox = makeProcessor({
    debounceMs: 0,
    runInbox: async () => { inboxCount += 1; return { ok: true }; },
    runFreeSite: () => { started += 1; return blocked; },
    reportFailure: async () => { reported += 1; },
  });
  processInbox('startup');
  await until(() => started === 1);
  processInbox('new-message');
  await until(() => inboxCount === 2);
  release({ ok: false });
  await until(() => reported === 1);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(started, 1);
  assert.equal(reported, 1);
});

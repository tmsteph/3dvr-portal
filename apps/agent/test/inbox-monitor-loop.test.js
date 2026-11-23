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
  let fallbackCalls = 0;
  let releaseWorker;
  const unresolved = new Promise((resolve) => { releaseWorker = resolve; });
  const processInbox = makeProcessor({
    debounceMs: 0,
    runInbox: async (reason) => { reasons.push(reason); return { ok: true }; },
    runFreeSite: () => { started += 1; return unresolved; },
    dispatchFallback: async () => { fallbackCalls += 1; },
  });

  processInbox('startup');
  await until(() => reasons.length === 1 && started === 1);
  processInbox('new-message');
  await until(() => reasons.length === 2);
  assert.deepEqual(reasons, ['startup', 'new-message']);
  assert.equal(started, 1, 'uncertain fulfillment must not be replayed');
  assert.equal(fallbackCalls, 0, 'slow job must not trigger duplicate fallback');
  releaseWorker({ ok: true });
});

test('completed failed free-site work dispatches fallback once without blocking inbox', async () => {
  const reasons = [];
  let dispatched = 0;
  const processInbox = makeProcessor({
    debounceMs: 0,
    runInbox: async (reason) => { reasons.push(reason); return { ok: true }; },
    runFreeSite: async () => ({ ok: false }),
    dispatchFallback: async () => { dispatched += 1; },
  });
  processInbox('startup');
  await until(() => dispatched === 1);
  assert.deepEqual(reasons, ['startup']);
  assert.equal(dispatched, 1);
});

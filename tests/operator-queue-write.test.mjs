import test from 'node:test';
import assert from 'node:assert/strict';
import { writeQueueRecords } from '../scripts/operator-queue-write.mjs';
const entries = [['tasks', 1], ['latest', 2], ['runtime', 3]];
for (const [name, failure] of [['missing acknowledgment', {}], ['negative acknowledgment', { acknowledged: false, error: 'rejected' }], ['timeout', { acknowledged: false, timedOut: true }]]) {
  test(`stops without retry on ${name}`, async () => {
    const called = [];
    const result = await writeQueueRecords(entries, async key => { called.push(key); return key === 'latest' ? failure : { acknowledged: true }; });
    assert.deepEqual(called, ['tasks', 'latest']);
    assert.equal(result.acknowledged, false);
    assert.equal(result.partial, true);
  });
}
test('first failure prevents later writes', async () => {
  const called = [];
  const result = await writeQueueRecords(entries, async key => { called.push(key); return { acknowledged: false }; });
  assert.deepEqual(called, ['tasks']);
  assert.equal(result.partial, false);
});
test('success writes each record once and in order', async () => {
  const called = [];
  const result = await writeQueueRecords(entries, async key => { called.push(key); return { acknowledged: true }; });
  assert.deepEqual(called, ['tasks', 'latest', 'runtime']);
  assert.equal(result.acknowledged, true);
});
test('thrown write fails closed without retry', async () => {
  const called = [];
  const result = await writeQueueRecords(entries, async key => { called.push(key); if (key === 'latest') throw Error('offline'); return { acknowledged: true }; });
  assert.deepEqual(called, ['tasks', 'latest']);
  assert.equal(result.acknowledged, false);
});

test('first write timeout reports uncertain persistence without retry', async () => {
  const called = [];
  const result = await writeQueueRecords(entries, async key => {
    called.push(key);
    return { acknowledged: false, timedOut: true };
  });
  assert.deepEqual(called, ['tasks']);
  assert.equal(result.acknowledged, false);
  assert.equal(result.partial, true);
  assert.equal(result.uncertain, true);
});
test('first missing acknowledgment reports uncertain persistence', async () => {
  const result = await writeQueueRecords(entries, async () => ({}));
  assert.equal(result.partial, true);
  assert.equal(result.uncertain, true);
});
test('first explicit rejection is not misclassified as uncertain', async () => {
  const result = await writeQueueRecords(entries, async () => ({ acknowledged: false, error: 'rejected' }));
  assert.equal(result.partial, false);
  assert.equal(result.uncertain, false);
});

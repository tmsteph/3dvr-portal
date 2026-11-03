const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { enqueueTask, readTask, runQueuedTask, normalizeTaskRecord } = require('../thomas-agent/node/agent-task-queue');

for (const length of [42, 6000, 26000]) {
  test(`private result of ${length} characters survives a fresh SQLite reader`, async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'operator-result-'));
    const options = { queueStore: 'sqlite', queueDb: path.join(dir, 'queue.sqlite'), ownerAlias: 'owner-a',
      gunSync: false, deviceId: 'synthetic-worker', workerCapabilities: 'codex', workerRiskClasses: 'draft' };
    const text = 'x'.repeat(length - 4) + 'TAIL';
    try {
      const task = await enqueueTask('Synthetic result test', { ...options, id: `operator-http-result-${length}`, backend: 'codex', queueSource: 'operator-http' });
      await runQueuedTask(task, { ...options, runAgentTaskImpl: async () => ({ ok: true, result: { stdout: text } }) });
      // Every read reopens the database, independently of the worker.
      const result = await readTask(task.id, { ...options });
      assert.equal(result.status, 'completed');
      assert.equal(result.resultSummary, text.slice(0, 2000));
      assert.equal(result.resultText, text.slice(0, 24000));
      assert.equal(result.resultSummaryTruncated, length > 2000);
      assert.equal(result.resultTruncated, length > 24000);
      assert.equal(await readTask(task.id, { ...options, ownerAlias: 'owner-b' }), null);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
}

test('private failed tasks preserve bounded stderr and the existing failed status', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'operator-result-error-'));
  const options = { queueStore: 'sqlite', queueDb: path.join(dir, 'queue.sqlite'), ownerAlias: 'owner-a',
    gunSync: false, deviceId: 'synthetic-worker', workerCapabilities: 'codex', workerRiskClasses: 'draft' };
  const text = 'failure '.repeat(500);
  try {
    const task = await enqueueTask('Synthetic failure', { ...options, id: 'operator-http-result-error', backend: 'codex', queueSource: 'operator-http' });
    await runQueuedTask(task, { ...options, runAgentTaskImpl: async () => ({ ok: false, result: { stderr: text } }) });
    const result = await readTask(task.id, options);
    assert.equal(result.status, 'failed');
    assert.equal(result.resultText, text);
    assert.equal(result.error, text.slice(0, 2000).trim());
    assert.equal(result.resultSummaryTruncated, true);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('ordinary task normalization does not carry private result fields into relay records', () => {
  const ordinary = normalizeTaskRecord({ id: 'ordinary', resultText: 'private', resultTruncated: true });
  assert.equal(Object.hasOwn(ordinary, 'resultText'), false);
  assert.equal(Object.hasOwn(ordinary, 'resultTruncated'), false);
});

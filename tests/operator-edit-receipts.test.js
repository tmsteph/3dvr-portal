import test from 'node:test';
import assert from 'node:assert/strict';
import { forgeEditReceipt, waitForForgeEdit } from '../operator/forge-status.js';

test('completion without evidence is not reported as a verified fix', () => {
  assert.match(forgeEditReceipt({ status: 'completed' }), /no verification summary/);
  assert.doesNotMatch(forgeEditReceipt({ status: 'completed' }), /completed the signed GitHub write/);
});

test('completion shows the worker result, including blockers', () => {
  const summary = 'Changed spinner selection. 6 tests passed. Deployment not performed.';
  assert.equal(forgeEditReceipt({ status: 'completed', resultSummary: summary }),
    `Forge reports the task completed. Result: ${summary}`);
});

test('queued and unknown tasks are not claimed to be running', () => {
  for (const record of [{}, { status: 'queued' }]) {
    assert.match(forgeEditReceipt(record), /queued/);
  }
  assert.match(forgeEditReceipt({ status: 'running' }), /working/);
});

test('a status timeout without observations does not invent execution', async () => {
  const previous = globalThis.Gun;
  const node = { get() { return this; }, on() {}, off() {} };
  globalThis.Gun = () => node;
  try {
    const result = await waitForForgeEdit('task-1', { timeoutMs: 1 });
    assert.equal(result.status, 'queued');
    assert.equal(result.timedOut, true);
  } finally {
    globalThis.Gun = previous;
  }
});

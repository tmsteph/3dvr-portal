import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { normalizeOperatorResult } from '../src/operator/api.js';
import { buildOperatorDelegatedTask, watchConfirmedTask } from '../operator/delegate-task.js';

test('Operator normalizes generic delegated tasks', () => {
  const result = normalizeOperatorResult({
    reply: 'I can hand that off.',
    suggestions: [],
    action: {
      type: 'delegate_task',
      title: 'Research queue',
      text: 'Compare the two runtime approaches.',
      business: '',
      location: '',
      url: '',
      repo: ''
    }
  });

  assert.equal(result.action.type, 'delegate_task');
  assert.equal(result.action.title, 'Research queue');
  assert.equal(result.action.text, 'Compare the two runtime approaches.');
});

test('delegated tasks enter the shared runtime as low-risk draft work', () => {
  const built = buildOperatorDelegatedTask({
    title: 'Inspect runtime',
    text: 'Inspect the runtime and summarize the next useful fix.'
  }, {
    id: 'operator-work-test',
    now: '2026-09-23T07:00:00.000Z',
    tenantAlias: 'tester'
  });

  assert.equal(built.record.id, 'operator-work-test');
  assert.equal(built.record.backend, 'auto');
  assert.equal(built.record.riskClass, 'draft');
  assert.equal(built.record.approvalStatus, 'not_required');
  assert.equal(built.record.maxRuntimeMs, 120_000);
  assert.equal(built.record.runtimeWorkflow, 'operator-delegated-task');
  assert.equal(built.record.workerLane, 'general');
  assert.match(built.record.task, /Do not send messages, spend money/);
});

test('browser action router delegates the new action type', async () => {
  const source = await readFile(new URL('../operator/actions.js', import.meta.url), 'utf8');
  assert.match(source, /action\.type === 'delegate_task'/);
  assert.match(source, /queueOperatorTask/);
});

test('uncertain Operator admission keeps polling its exact ID after 404', { timeout: 7000 }, async t => {
  const id = 'test-request-id-123';
  const calls = [];
  const result = await new Promise(resolve => {
    const stop = watchConfirmedTask(id, { timeoutMs: 6000, onUpdate: resolve }, async (action, requestId) => {
      calls.push([action, requestId]);
      if (calls.length < 3) throw Object.assign(new Error('Missing receipt'), { status: 404 });
      return { record: { status: 'completed', resultText: '42' } };
    });
    t.after(stop);
  });
  assert.equal(result.status, 'completed');
  assert.equal(result.id, 'operator-http:' + id);
  assert.deepEqual(calls, Array(3).fill(['status', id]));
});

test('Operator watcher stops on authorization denial without retry', { timeout: 1000 }, async t => {
  let count = 0;
  const result = await new Promise(resolve => {
    const stop = watchConfirmedTask('test-request-id-123', { onUpdate: resolve }, async () => {
      count += 1;
      throw Object.assign(new Error('Sign in again'), { status: 401 });
    });
    t.after(stop);
  });
  assert.equal(result.status, 'blocked');
  assert.equal(count, 1);
});

test('Operator watcher deadline does not claim an unconfirmed task was saved', { timeout: 1000 }, async t => {
  const result = await new Promise(resolve => {
    const stop = watchConfirmedTask('test-request-id-123', { timeoutMs: 0, onUpdate: resolve }, async () => {
      throw Object.assign(new Error('Missing receipt'), { status: 404 });
    });
    t.after(stop);
  });
  assert.equal(result.status, 'blocked');
  assert.match(result.error, /server state is not confirmed/);
  assert.match(result.error, /same task before submitting again/);
});

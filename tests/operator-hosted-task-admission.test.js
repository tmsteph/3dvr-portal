import test from 'node:test';
import assert from 'node:assert/strict';
import { admitHostedTask, taskVisibleToTenant } from '../src/operator-runtime/hosted-task-admission.js';

const request = { kind: 'repo-status', repository: 'tmsteph/3dvr-portal', idempotencyKey: 'test-key-123' };
const submit = (extra = {}) => admitHostedTask({ tenantId: 'pilot-a', request, limits: { remainingCents: 1 }, ...extra });

test('admit bounded read-only repository status task', () => {
  assert.deepEqual(submit().task, { tenantId: 'pilot-a', ...request, status: 'queued' });
});
test('reject missing identity, unknown kinds and unsafe repositories', () => {
  assert.equal(admitHostedTask({ request }).reason, 'unauthenticated');
  assert.equal(submit({ request: { ...request, kind: 'shell' } }).reason, 'invalid_request');
  assert.equal(submit({ request: { ...request, repository: '../private' } }).reason, 'invalid_request');
});
test('idempotency applies only within tenant', () => {
  const previous = { ...submit().task, id: 'existing' };
  assert.equal(submit({ existing: [previous] }).task.id, 'existing');
  assert.equal(admitHostedTask({ tenantId: 'pilot-b', request, existing: [previous], limits: { remainingCents: 1 } }).duplicate, false);
});
test('concurrency and budget are fail closed', () => {
  const active = [0, 1].map(i => ({ tenantId: 'pilot-a', status: 'running', idempotencyKey: 'other-' + i }));
  assert.equal(submit({ existing: active }).reason, 'concurrency_limit');
  assert.equal(submit({ limits: { remainingCents: 0 } }).reason, 'budget_exhausted');
  for (const limits of [{}, { remainingCents: '1' }, { remainingCents: NaN }, { remainingCents: -1 }]) {
    assert.equal(submit({ limits }).reason, 'budget_exhausted');
  }
  assert.equal(submit({ limits: { remainingCents: 1 } }).ok, true);
});
test('tenant cannot read another tenant task', () => {
  const task = submit().task;
  assert.equal(taskVisibleToTenant(task, 'pilot-b'), false);
  assert.equal(taskVisibleToTenant(task, 'pilot-a'), true);
});

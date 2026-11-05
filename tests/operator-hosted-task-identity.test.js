import test from 'node:test';
import assert from 'node:assert/strict';
import { admitHostedTask } from '../src/operator-runtime/hosted-task-admission.js';

test('accepts dotted SEA identity and rejects conflicting idempotency reuse', () => {
  const tenantId = 'sea:abc123.DEF456_-';
  const request = { kind: 'repo-status', repository: 'tmsteph/3dvr-portal', idempotencyKey: 'same-key-123' };
  const first = admitHostedTask({ tenantId, request });
  assert.equal(first.ok, true);
  const existing = [{ ...first.task, id: 'one' }];
  assert.equal(admitHostedTask({ tenantId, request, existing }).duplicate, true);
  const conflict = admitHostedTask({
    tenantId, request: { ...request, repository: 'other/repository' }, existing
  });
  assert.equal(conflict.ok, false);
  assert.equal(conflict.reason, 'idempotency_conflict');
});

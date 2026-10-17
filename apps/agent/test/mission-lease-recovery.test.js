const test = require('node:test');
const assert = require('node:assert/strict');
const { acquireLease, renewLease, releaseLease } = require('../thomas-agent/node/mission-lease');
const state = () => ({ tasks: { job: {} } });

test('a different worker cannot steal a live lease', () => {
  const s = state(); acquireLease(s, 'job', 'a', 100, 1000);
  assert.equal(acquireLease(s, 'job', 'b', 200, 1000).acquired, false);
});
test('expired leases are replaced and stale workers are fenced out', () => {
  const s = state(); const old = acquireLease(s, 'job', 'a', 100, 100).lease;
  const next = acquireLease(s, 'job', 'b', 201, 100).lease;
  assert.notEqual(next.leaseId, old.leaseId);
  assert.equal(renewLease(s, 'job', old.leaseId, 'a', 202, 100), false);
  assert.equal(releaseLease(s, 'job', old.leaseId), false);
  assert.equal(renewLease(s, 'job', next.leaseId, 'b', 202, 100), true);
  assert.equal(s.tasks.job.lease.expiresAt, 302);
});
test('renewal refuses expired leases and invalid durations', () => {
  const s = state(); const lease = acquireLease(s, 'job', 'a', 100, 100).lease;
  assert.equal(renewLease(s, 'job', lease.leaseId, 'a', 200, 100), false);
  assert.throws(() => acquireLease(s, 'job', 'a', 100, 0), /TTL/);
  assert.throws(() => renewLease(s, 'job', lease.leaseId, 'a', 101, -1), /TTL/);
});

const crypto = require('node:crypto');
function acquireLease(state, taskId, owner, now = Date.now(), ttlMs = 15 * 60 * 1000) {
  const task = state.tasks[taskId]; if (!task) throw new Error(`unknown task: ${taskId}`);
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) throw new Error('lease TTL must be positive');
  if (task.lease && task.lease.expiresAt > now && task.lease.owner !== owner) return { acquired: false, lease: task.lease };
  task.lease = { leaseId: `lease_${crypto.randomUUID()}`, owner, acquiredAt: now, expiresAt: now + ttlMs }; return { acquired: true, lease: task.lease };
}
function renewLease(state, taskId, leaseId, owner, now = Date.now(), ttlMs = 15 * 60 * 1000) {
  const task = state.tasks[taskId]; if (!task) throw new Error(`unknown task: ${taskId}`);
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) throw new Error('lease TTL must be positive');
  const lease = task.lease;
  if (!lease || lease.leaseId !== leaseId || lease.owner !== owner || lease.expiresAt <= now) return false;
  lease.expiresAt = now + ttlMs;
  return true;
}
function releaseLease(state, taskId, leaseId) { const task = state.tasks[taskId]; if (!task?.lease || task.lease.leaseId !== leaseId) return false; delete task.lease; return true; }
module.exports = { acquireLease, renewLease, releaseLease };

const test = require('node:test');
const assert = require('node:assert/strict');
const { canWorkerRunTask, buildTaskArgs, normalizeTaskRecord } = require('../thomas-agent/node/agent-task-queue');

test('legacy unsafe approval cannot replay automatically after worker restart', () => {
  const task = normalizeTaskRecord({ id: 'legacy', task: 'Prior queued action', backend: 'codex', riskClass: 'workspace_write', unsafe: true, approvalStatus: 'approved', status: 'queued' });
  assert.equal(canWorkerRunTask(task, { workerCapabilities: 'node,codex' }).ok, false);
});

test('worker-wide unsafe option cannot elevate a safe queued task', () => {
  const args = buildTaskArgs({ task: 'Read status', backend: 'codex', unsafe: false }, { unsafe: true });
  assert.equal(args.includes('--unsafe'), false);
});

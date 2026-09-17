const assert = require('node:assert/strict');
const test = require('node:test');
const {
  enqueueTranscendCycle,
  planTranscendCycle,
  rankCandidates,
} = require('../thomas-agent/node/transcend-loop');

test('transcend loop selects the highest-leverage eligible task', () => {
  const plan = planTranscendCycle({
    purpose: 'Help people turn purpose into useful, sustainable work.',
    candidates: [
      { task: 'Polish a low-impact settings page', purposeAlignment: 2, userValue: 1, effort: 3, riskClass: 'workspace_write' },
      { task: 'Repair the booking workflow blocker', purposeAlignment: 5, userValue: 5, revenue: 4, urgency: 5, unblocks: 5, reuse: 4, effort: 2, riskClass: 'workspace_write' },
    ],
  }, { now: Date.UTC(2026, 8, 17) });

  assert.equal(plan.next.task, 'Repair the booking workflow blocker');
  assert.equal(plan.ranked[0].eligible, true);
  assert.match(plan.rule, /explicit approval/);
});

test('approval-gated work cannot outrank a safe task until approved', () => {
  const ranked = rankCandidates([
    { task: 'Send a campaign', purposeAlignment: 5, userValue: 5, revenue: 5, urgency: 5, unblocks: 5, reuse: 5, effort: 1, riskClass: 'external_write' },
    { task: 'Prepare campaign drafts', purposeAlignment: 4, userValue: 4, revenue: 4, urgency: 4, unblocks: 4, reuse: 4, effort: 2, riskClass: 'draft' },
  ]);

  assert.equal(ranked[0].task, 'Prepare campaign drafts');
  assert.equal(ranked[1].eligible, false);
  assert.match(ranked[1].eligibilityReason, /approval required/);
});

test('enqueue uses the existing queue contract for the selected task', async () => {
  let captured;
  const result = await enqueueTranscendCycle({
    candidates: [
      { task: 'Audit scheduling integration', purposeAlignment: 5, userValue: 5, unblocks: 5, reuse: 4, effort: 1, riskClass: 'read_only', requiredCapabilities: 'browser' },
    ],
  }, {
    tenantId: 'test:owner',
    enqueueTaskImpl: async (task, options) => {
      captured = { task, options };
      return { id: 'queued-1', task };
    },
  });

  assert.equal(result.enqueued.id, 'queued-1');
  assert.equal(captured.task, 'Audit scheduling integration');
  assert.equal(captured.options.riskClass, 'read_only');
  assert.equal(captured.options.requiredCapabilities, 'browser');
  assert.equal(captured.options.tenantId, 'test:owner');
});

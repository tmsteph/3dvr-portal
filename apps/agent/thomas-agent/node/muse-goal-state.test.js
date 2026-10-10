'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createGoal, transition } = require('./muse-goal-state');

test('read-only goal advances with evidence', () => {
  let goal = createGoal({ title: 'Check status', steps: [{ kind: 'read_only', description: 'Inspect status' }] });
  goal = transition(goal, { type: 'start' });
  assert.equal(goal.status, 'working');
  goal = transition(goal, { type: 'complete_step', evidence: 'status:ok' });
  assert.equal(goal.status, 'complete');
  assert.equal(goal.cursor, 1);
});
test('sensitive actions require explicit approval evidence', () => {
  let goal = createGoal({ title: 'Notify', steps: [{ kind: 'message_person', description: 'Send message' }] });
  goal = transition(goal, { type: 'start' });
  assert.equal(goal.status, 'needs_approval');
  assert.throws(() => transition(goal, { type: 'complete_step', evidence: 'sent' }));
  assert.throws(() => transition(goal, { type: 'approve' }));
  goal = transition(goal, { type: 'approve', approver: 'owner', approvalId: 'approval-1' });
  assert.equal(goal.status, 'working');
});
test('paused goals do not start', () => {
  let goal = createGoal({ title: 'Inspect', steps: [{ kind: 'read_only', description: 'Inspect' }] });
  goal = transition(goal, { type: 'pause' });
  assert.throws(() => transition(goal, { type: 'start' }));
  goal = transition(goal, { type: 'resume' });
  assert.equal(transition(goal, { type: 'start' }).status, 'working');
});

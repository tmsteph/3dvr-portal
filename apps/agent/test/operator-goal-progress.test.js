const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const store = require('../thomas-agent/node/task-queue-sqlite-store');

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'operator-goal-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const options = { queueDb: path.join(dir, 'queue.sqlite'), ownerAlias: 'owner-a', now: 1000 };
  store.writeTask({ id: 'task', status: 'queued', updatedAt: new Date(1000).toISOString() }, options);
  store.claimTask('task', 'claim-a', 'worker', 2000, 1000, options);
  const definition = { title: 'Health', steps: [{ kind: 'read_only', description: 'Read health' }],
    acceptanceChecks: [{ id: 'health', description: 'Read-back matches receipt' }] };
  const goal = store.initializeTaskGoal('task', 'claim-a', definition, options);
  return { options, definition, goal };
}

function advance(options, goal, event, claim = 'claim-a') {
  return store.transitionTaskGoal('task', claim, goal.revision, event, options);
}

test('goal cannot finish before all outcome checks pass; stale finish preserves checkpoint', t => {
  let { options, goal } = fixture(t);
  const staleTask = store.readTask('task', options);
  goal = advance(options, goal, { type: 'start' });
  goal = advance(options, goal, { type: 'complete_step', evidence: 'receipt:1' });
  assert.equal(goal.status, 'verifying');
  assert.throws(() => advance(options, goal, { type: 'complete_goal' }), /not passed/);
  assert.equal(store.finishTask('task', 'claim-a', { ...staleTask, status: 'completed' }, options), false);
  goal = advance(options, goal, { type: 'verify_check', checkId: 'health', passed: false, evidence: 'read-back failed' });
  assert.throws(() => advance(options, goal, { type: 'complete_goal' }), /not passed/);
  assert.throws(() => advance(options, goal, { type: 'verify_check', checkId: 'health', passed: true, evidence: ' ' }), /evidence/);
  goal = advance(options, goal, { type: 'verify_check', checkId: 'health', passed: true, evidence: 'read-back:ok' });
  goal = advance(options, goal, { type: 'complete_goal' });
  assert.equal(store.finishTask('task', 'claim-a', { ...staleTask, status: 'completed' }, options), true);
  const persisted = store.readTask('task', options);
  assert.equal(persisted.goal.revision, goal.revision);
  assert.equal(persisted.goal.acceptanceChecks[0].evidence, 'read-back:ok');
});

test('checkpoint survives a new process and expired running claims stay held for review', t => {
  let { options, goal } = fixture(t);
  goal = advance(options, goal, { type: 'start' });
  goal = advance(options, goal, { type: 'complete_step', evidence: 'receipt:1' });
  const modulePath = require.resolve('../thomas-agent/node/task-queue-sqlite-store');
  const child = spawnSync(process.execPath, ['-e',
    'const s=require(process.argv[1]); console.log(JSON.stringify(s.readTask("task",JSON.parse(process.argv[2])).goal));',
    modulePath, JSON.stringify(options)], { encoding: 'utf8' });
  assert.equal(child.status, 0, child.stderr);
  assert.deepEqual(JSON.parse(child.stdout), goal);
  // A previous worker may have performed external side effects before its
  // claim expired. Never automatically take over and replay that work.
  assert.equal(store.claimTask('task', 'claim-b', 'replacement', 3000, 2001, options), null);
  const held = store.readTask('task', options);
  assert.equal(held.status, 'running');
  assert.deepEqual(held.goal, goal);
  assert.throws(() => advance({ ...options, now: 2002 }, goal,
    { type: 'verify_check', checkId: 'health', passed: true, evidence: 'ok' }), /claim/);
  assert.throws(() => advance({ ...options, now: 2002 }, goal,
    { type: 'verify_check', checkId: 'health', passed: true, evidence: 'ok' }, 'claim-b'), /claim/);
  assert.deepEqual(store.readTask('task', options).goal, goal);
});

test('claims, owner isolation and revision checks protect durable progress', t => {
  const { options, definition, goal } = fixture(t);
  assert.throws(() => store.initializeTaskGoal('task', 'claim-a', definition, options), /revision/);
  assert.throws(() => advance({ ...options, ownerAlias: 'owner-b' }, goal, { type: 'start' }), /claim/);
  assert.throws(() => advance({ ...options, now: 2000 }, goal, { type: 'start' }), /claim/);
  assert.throws(() => advance(options, goal, { type: 'start' }, 'wrong'), /claim/);
  advance(options, goal, { type: 'start' });
  assert.throws(() => advance(options, goal, { type: 'start' }), /revision/);
  assert.equal(store.readTask('task', options).goal.revision, 1);
});

test('cancelled tasks cannot checkpoint; pause resumes verification without replay', t => {
  let { options, goal } = fixture(t);
  goal = advance(options, goal, { type: 'start' });
  goal = advance(options, goal, { type: 'complete_step', evidence: 'receipt:1' });
  goal = advance(options, goal, { type: 'pause' });
  goal = advance(options, goal, { type: 'resume' });
  assert.equal(goal.status, 'verifying');
  const task = store.readTask('task', options);
  assert.equal(store.finishTask('task', 'claim-a', { ...task, status: 'cancelled' }, options), true);
  assert.throws(() => advance(options, goal,
    { type: 'verify_check', checkId: 'health', passed: true, evidence: 'ok' }), /claim/);
});

test('durable goals require outcome checks; legacy tasks retain finish behavior', t => {
  const { options } = fixture(t);
  store.writeTask({ id: 'legacy', status: 'queued', updatedAt: 'now' }, options);
  store.claimTask('legacy', 'legacy-claim', 'worker', 2000, 1000, options);
  assert.throws(() => store.initializeTaskGoal('legacy', 'legacy-claim',
    { title: 'No checks', steps: [] }, options), /checks required/);
  assert.equal(store.finishTask('legacy', 'legacy-claim',
    { id: 'legacy', status: 'completed', updatedAt: 'now' }, options), true);
});

test('expired claim cannot finalize even a fully verified goal', t => {
  let { options, goal } = fixture(t);
  goal = advance(options, goal, { type: 'start' });
  goal = advance(options, goal, { type: 'complete_step', evidence: 'receipt' });
  goal = advance(options, goal, { type: 'verify_check', checkId: 'health', passed: true, evidence: 'ok' });
  advance(options, goal, { type: 'complete_goal' });
  assert.equal(store.finishTask('task', 'claim-a',
    { id: 'task', status: 'completed', updatedAt: 'now' }, { ...options, now: 2000 }), false);
  assert.equal(store.readTask('task', options).status, 'running');
});

test('stale completion cannot roll task timestamps behind the checkpoint', t => {
  let { options, goal } = fixture(t);
  const stale = store.readTask('task', options);
  options = { ...options, now: 1500 };
  goal = advance(options, goal, { type: 'start' });
  goal = advance(options, goal, { type: 'complete_step', evidence: 'receipt' });
  goal = advance(options, goal, { type: 'verify_check', checkId: 'health', passed: true, evidence: 'ok' });
  goal = advance(options, goal, { type: 'complete_goal' });
  assert.equal(store.finishTask('task', 'claim-a', { ...stale, status: 'completed' },
    { ...options, now: 1600 }), true);
  assert.equal(store.readTask('task', options).updatedAt, new Date(1600).toISOString());
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { validateMission } = require('../thomas-agent/node/mission-schema');
const { atomicWrite, appendEvent, initialState, loadState, readEvents } = require('../thomas-agent/node/mission-store');
const { nextTask, plan, retryAllowed } = require('../thomas-agent/node/mission-planner');
const { renderStatus } = require('../thomas-agent/node/mission-status');
const { redact, workerResult } = require('../thomas-agent/node/mission-evidence');
const { assertAllowedFiles } = require('../thomas-agent/node/mission-git');
const { approve, createApproval, matchesApproval } = require('../thomas-agent/node/mission-approvals');
const { compareBaseline } = require('../thomas-agent/node/mission-baseline');
const { loadMission, parseArgs, runMission } = require('../thomas-agent/node/mission-runner');

async function temp() { return fs.mkdtemp(path.join(os.tmpdir(), '3dvr-mission-')); }

test('JSON mission schema is versioned, complete, and dependency-aware', async () => {
  const mission = await loadMission('life-upgrade-v01');
  assert.equal(mission.schemaVersion, 1);
  assert.equal(mission.missionId, 'life-upgrade-v01');
  assert.equal(mission.tasks.length, 10);
  assert.deepEqual(validateMission(mission), []);
  const state = initialState(mission);
  assert.equal(nextTask(mission, state).id, 'inspect-current-state');
  state.tasks['inspect-current-state'].state = 'completed';
  assert.equal(nextTask(mission, state).id, 'merge-daily-direction-privacy');
  assert.equal(retryAllowed(mission.tasks[0], state), true);
});

test('malformed and missing state recover, while future schema is preserved', async () => {
  const dir = await temp(); const mission = await loadMission('life-upgrade-v01');
  const missing = await loadState(mission, dir); assert.equal(missing.schemaVersion, 1);
  await fs.mkdir(path.join(dir, mission.missionId), { recursive: true });
  await fs.writeFile(path.join(dir, mission.missionId, 'state.json'), '{broken');
  assert.equal((await loadState(mission, dir)).state, 'queued');
  await fs.writeFile(path.join(dir, mission.missionId, 'state.json'), JSON.stringify({ schemaVersion: 99, future: true }));
  await assert.rejects(() => loadState(mission, dir), /newer than supported/);
  assert.match(await fs.readFile(path.join(dir, mission.missionId, 'state.json'), 'utf8'), /future/);
});

test('atomic writes, append-only events, and deterministic status work together', async () => {
  const dir = await temp(); const mission = await loadMission('life-upgrade-v01'); const state = initialState(mission);
  await atomicWrite(path.join(dir, 'atomic.json'), { ok: true });
  await appendEvent({ missionId: mission.missionId, type: 'mission.started', summary: 'Mission started.' }, dir);
  await appendEvent({ missionId: mission.missionId, type: 'task.ready', taskId: 'inspect-current-state', summary: 'Task ready.' }, dir);
  const events = await readEvents(mission.missionId, dir); assert.equal(events.length, 2); assert.ok(events[0].eventId);
  assert.match(renderStatus(mission, state, events), /# Live mission status/);
  assert.match(renderStatus(mission, state, events), /inspect-current-state/);
});

test('approval is scoped to mission, task, target, action, and current head SHA', () => {
  const approval = createApproval('life-upgrade-v01', 'await-life-upgrade-merge-approval', { action: 'merge_pull_request', target: 'tmsteph/3dvr-portal#1170' }, 'abc');
  assert.equal(matchesApproval(approve(approval, 'abc'), { missionId: 'life-upgrade-v01', taskId: approval.taskId, action: approval.action, target: approval.target }, 'abc'), true);
  assert.equal(matchesApproval({ ...approve(approval, 'abc'), target: 'tmsteph/3dvr-portal#1169' }, { missionId: 'life-upgrade-v01', taskId: approval.taskId, action: approval.action, target: approval.target }, 'abc'), false);
  assert.throws(() => approve(approval, 'changed'), /expired/);
});

test('scope enforcement and secret redaction protect worker evidence', () => {
  assertAllowedFiles(['life-upgrade/app.js', 'tests/life-upgrade.test.js'], ['life-upgrade/**', 'tests/life-upgrade.test.js']);
  assert.throws(() => assertAllowedFiles(['billing/stripe.js'], ['life-upgrade/**']), /file scope exceeded/);
  const result = workerResult({ taskId: 'x', status: 'completed', commandsRun: ['Authorization: Bearer abc', 'password=secret'], observations: ['safe'] });
  assert.equal(result.commandsRun[0], 'Authorization: Bearer [REDACTED]');
  assert.equal(redact({ token: 'hidden' }).token, '[REDACTED]');
});

test('baseline helper compares the same command without mislabeling a feature failure', async () => {
  const feature = await temp(); const baseline = await temp();
  const result = await compareBaseline({ command: ['node', '-e', 'process.exit(1)'], featureCwd: feature, baselineCwd: baseline });
  assert.equal(result.classification, 'baseline_or_environment');
});

test('simulation persists state, events, and readable status, then stops at merge approval', async () => {
  const dir = await temp(); const result = await runMission(['run', 'life-upgrade-v01', '--simulate', '--state-root', dir], { options: { stateRoot: dir } });
  assert.equal(result.status, 'awaiting_approval');
  const state = JSON.parse(await fs.readFile(path.join(dir, 'life-upgrade-v01', 'state.json'), 'utf8'));
  assert.equal(state.currentTaskId, 'await-life-upgrade-merge-approval');
  assert.ok((await readEvents('life-upgrade-v01', dir)).length >= 10);
  assert.match(await fs.readFile(path.join(dir, 'life-upgrade-v01', 'LIVE_STATUS.md'), 'utf8'), /human approval/);
});

test('CLI defaults to dry-run and exposes lifecycle commands', () => {
  assert.equal(parseArgs(['run', 'life-upgrade-v01']).execute, false);
  assert.equal(parseArgs(['run', 'life-upgrade-v01', '--execute', '--delegate']).delegate, true);
  assert.equal(parseArgs(['status', 'life-upgrade-v01']).command, 'status');
});

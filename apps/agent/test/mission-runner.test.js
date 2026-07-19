const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  initialState,
  loadMission,
  parseArgs,
  parseWorktrees,
  readState,
  runMission,
  selectNextTask,
  validateMission,
} = require('../thomas-agent/node/mission-runner');

test('mission definition is versioned and dependency-aware', async () => {
  const mission = await loadMission('life-upgrade-v01');
  assert.equal(mission.schemaVersion, 1);
  assert.deepEqual(validateMission(mission), []);
  assert.equal(selectNextTask(mission, initialState(mission.id)).id, 'inspect-release-state');
  assert.deepEqual(selectNextTask(mission, { completedTasks: ['inspect-release-state'] }).id, 'validate-release-evidence');
});

test('state recovery is safe for missing and malformed JSON', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), '3dvr-mission-state-'));
  const missing = await readState(path.join(dir, 'missing.json'), 'demo');
  await fs.writeFile(path.join(dir, 'bad.json'), '{not json');
  const malformed = await readState(path.join(dir, 'bad.json'), 'demo');
  assert.equal(missing.schemaVersion, 1);
  assert.equal(malformed.mission, 'demo');
  assert.deepEqual(malformed.completedTasks, []);
});

test('newer future-schema state is not silently overwritten', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), '3dvr-mission-state-'));
  const file = path.join(dir, 'future.json');
  await fs.writeFile(file, JSON.stringify({ schemaVersion: 99, mission: 'demo', futureData: true }));
  await assert.rejects(() => readState(file, 'demo'), /newer than supported/);
  assert.match(await fs.readFile(file, 'utf8'), /futureData/);
});

test('CLI parses inspect-only defaults and explicit execution', () => {
  assert.equal(parseArgs(['life-upgrade-v01']).execute, false);
  assert.equal(parseArgs(['life-upgrade-v01', '--execute', '--delegate']).delegate, true);
});

test('worktree porcelain parser preserves branch identity', () => {
  const entries = parseWorktrees('worktree /tmp/one\nHEAD abc\nbranch refs/heads/codex/one\n\nworktree /tmp/two\nHEAD def\nbranch refs/heads/main\n');
  assert.deepEqual(entries.map(entry => entry.branch), ['codex/one', 'main']);
});

test('mission definition keeps approval gate explicit', async () => {
  const mission = await loadMission('life-upgrade-v01');
  const gate = mission.tasks.find(task => task.id === 'human-merge-approval');
  assert.deepEqual(gate.requiresApproval, ['merge_pull_request']);
  assert.equal(gate.kind, 'approval_gate');
});

test('runner records a completed check and then pauses at the approval gate', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), '3dvr-mission-runner-'));
  const missionDir = path.join(root, 'missions');
  const stateDir = path.join(root, 'state');
  await fs.mkdir(missionDir);
  await fs.writeFile(path.join(missionDir, 'demo.json'), JSON.stringify({
    schemaVersion: 1,
    id: 'demo',
    branch: 'codex/demo',
    worktreePath: '.worktree',
    tasks: [
      { id: 'check', checks: [['node', '--version']] },
      { id: 'gate', dependsOn: ['check'], requiresApproval: ['merge_pull_request'] },
    ],
  }));
  const calls = [];
  const runCommand = async (command) => {
    calls.push(command);
    if (command[0] === 'git' && command[1] === 'worktree') {
      return { code: 0, stdout: 'worktree /tmp/demo\nbranch refs/heads/codex/demo\n', stderr: '' };
    }
    if (command[0] === 'git' && command[1] === 'status') {
      return { code: 0, stdout: '## codex/demo\n', stderr: '' };
    }
    return { code: 0, stdout: 'ok\n', stderr: '' };
  };
  const first = await runMission(['demo', '--execute'], { options: { repo: root, missionsDir: missionDir, stateDir }, runCommand });
  const second = await runMission(['demo', '--execute'], { options: { repo: root, missionsDir: missionDir, stateDir }, runCommand });
  assert.equal(first.completedTask, 'check');
  assert.equal(second.status, 'waiting_for_approval');
  assert.equal(second.task, 'gate');
  assert.ok(calls.some(command => command[0] === 'node'));
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { compileRune, splitList } = require('../thomas-agent/node/mission-rune');
const { validateMission } = require('../thomas-agent/node/mission-schema');
const { loadMission, runMission } = require('../thomas-agent/node/mission-runner');

const SOURCE = `
mission parser-test {
  repository: "tmsteph/3dvr-portal"
  objective: "Turn human intent into a bounded mission."

  task inspect {
    objective: "Inspect the repository."
    command: ["git", "status", "-sb"]
    evidence: "git status"
    retries: 2
  }

  task repair {
    objective: "Delegate one bounded repair."
    backend: codex
    risk: workspace_write
    model: coding
    worktree: true
    depends: [inspect]
    files: ["index.html", "tests/homepage.test.js"]
    accept: "focused tests pass"
    evidence: "changed files"
  }

  task merge {
    objective: "Stop for human merge approval."
    backend: deterministic
    risk: external_write
    depends: [repair]
    gate: [merge_pull_request, "tmsteph/3dvr-portal#1234"]
    evidence: "approval record"
  }
}
`;

async function temp() {
  return fs.mkdtemp(path.join(os.tmpdir(), '3dvr-rune-'));
}

test('RUNE compiles into the existing versioned mission schema', () => {
  const mission = compileRune(SOURCE);
  assert.equal(mission.schemaVersion, 1);
  assert.equal(mission.missionId, 'parser-test');
  assert.equal(mission.defaultBranch, 'main');
  assert.equal(mission.tasks.length, 3);
  assert.deepEqual(mission.tasks[0].commands, [['git', 'status', '-sb']]);
  assert.deepEqual(mission.tasks[1].dependsOn, ['inspect']);
  assert.deepEqual(mission.tasks[1].allowedFiles, ['index.html', 'tests/homepage.test.js']);
  assert.deepEqual(mission.tasks[2].approvalGate, { action: 'merge_pull_request', target: 'tmsteph/3dvr-portal#1234' });
  assert.deepEqual(validateMission(mission), []);
});

test('RUNE lists accept quoted values and bare identifiers', () => {
  assert.deepEqual(splitList('[inspect, "repair task"]', 1), ['inspect', 'repair task']);
});

test('RUNE rejects unknown fields instead of silently guessing', () => {
  assert.throws(() => compileRune(SOURCE.replace('evidence: "git status"', 'magic: true')), /unknown task field: magic/);
});

test('mission loader falls back from JSON to RUNE and keeps inspect-only execution', async () => {
  const missionsDir = await temp();
  const stateRoot = await temp();
  await fs.writeFile(path.join(missionsDir, 'parser-test.rune'), SOURCE);
  const mission = await loadMission('parser-test', missionsDir);
  assert.equal(mission.missionId, 'parser-test');
  const result = await runMission(['run', 'parser-test', '--state-root', stateRoot], { missionsDir, options: { stateRoot } });
  assert.equal(result.status, 'ready');
  assert.equal(result.taskId, 'inspect');
  assert.deepEqual(result.checks, [['git', 'status', '-sb']]);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadMission, validateMission } from '../scripts/agent/validate-mission.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('life-upgrade mission is valid and dependency-aware', async () => {
  const mission = await loadMission(path.join(root, 'docs/agent/missions/life-upgrade-v01.yaml'));
  assert.deepEqual(validateMission(mission), []);
  assert.equal(mission.id, 'life-upgrade-v01');
  assert.ok(mission.tasks.some(task => task.requiresApproval?.includes('merge')));
});

test('mission runner is inspect-only by default and records no product paths', async () => {
  const source = await readFile(path.join(root, 'scripts/agent/run-mission.mjs'), 'utf8');
  assert.match(source, /INSPECT-ONLY/);
  assert.match(source, /worktree is dirty/);
  assert.match(source, /inspect-github\.mjs/);
  assert.match(source, /if \(options\.execute\) await main\(\)/);
  assert.match(source, /delegatePrompt/);
  assert.doesNotMatch(source, /git reset --hard/);
});

test('approval gates include merge and deployment boundaries', async () => {
  const text = await readFile(path.join(root, 'docs/agent/APPROVAL_GATES.md'), 'utf8');
  assert.match(text, /merge a pull request/);
  assert.match(text, /deploy to production/);
  assert.match(text, /must set the mission to `waiting_for_approval`/);
});

test('mission declares stacked PRs and an explicit worktree path', async () => {
  const mission = await loadMission(path.join(root, 'docs/agent/missions/life-upgrade-v01.yaml'));
  assert.deepEqual(mission.pullRequests, [1169, 1170]);
  assert.equal(mission.baseBranch, 'fix/life-private-checkins');
  assert.equal(mission.worktreePath, '.agent-worktrees/life-upgrade-v01');
});

test('draft publication is gated and cannot merge or deploy', async () => {
  const source = await readFile(path.join(root, 'scripts/agent/publish-draft.mjs'), 'utf8');
  assert.match(source, /--publish/);
  assert.match(source, /--draft/);
  assert.doesNotMatch(source, /gh', \['pr', 'merge/);
  assert.doesNotMatch(source, /vercel/);
});

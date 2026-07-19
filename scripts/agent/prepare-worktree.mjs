import { execFile } from 'node:child_process';
import { access, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { loadMission, validateMission } from './validate-mission.mjs';

const repo = path.resolve(new URL('../..', import.meta.url).pathname);

function git(args) {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd: repo }, (error, stdout, stderr) => {
      if (error) reject(new Error(stderr.trim() || error.message));
      else resolve(stdout.trim());
    });
  });
}

const missionId = process.argv[2];
const create = process.argv.includes('--create');
if (!missionId) throw new Error('Usage: npm run agent:worktree -- <mission-id> [--create]');

const mission = await loadMission(path.join(repo, 'docs/agent/missions', `${missionId}.yaml`));
const errors = validateMission(mission);
if (errors.length) throw new Error(errors.join('; '));
const target = path.resolve(repo, mission.worktreePath || `.agent-worktrees/${mission.id}`);
const worktrees = await git(['worktree', 'list', '--porcelain']);
const existing = worktrees.split('\n').find(line => line === `worktree ${target}`);
if (existing) {
  console.log(`REUSE: ${target}`);
} else if (!create) {
  console.log(`PLAN: git worktree add ${target} ${mission.branch}`);
  console.log('INSPECT-ONLY: pass --create to create or reuse this worktree.');
} else {
  await mkdir(path.dirname(target), { recursive: true });
  try {
    await access(target);
    throw new Error(`target exists but is not a registered worktree: ${target}`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  await git(['worktree', 'add', target, mission.branch]);
  console.log(`CREATED: ${target}`);
}

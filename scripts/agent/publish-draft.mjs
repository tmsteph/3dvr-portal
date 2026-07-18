import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadMission, validateMission } from './validate-mission.mjs';

const repo = path.resolve(new URL('../..', import.meta.url).pathname);
const missionId = process.argv[2];
const publish = process.argv.includes('--publish');
if (!missionId) throw new Error('Usage: npm run agent:publish-draft -- <mission-id> [--publish]');

function command(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { cwd: repo, ...options }, (error, stdout, stderr) => {
      if (error) reject(new Error(stderr.trim() || error.message));
      else resolve(stdout.trim());
    });
  });
}

const mission = await loadMission(path.join(repo, 'docs/agent/missions', `${missionId}.yaml`));
const errors = validateMission(mission);
if (errors.length) throw new Error(errors.join('; '));
if (!mission.draftPullRequest) throw new Error('Mission has no draftPullRequest configuration');
const status = await command('git', ['status', '--porcelain']);
if (status) throw new Error(`Refusing to publish from a dirty worktree:\n${status}`);
const branch = (await command('git', ['branch', '--show-current'])).trim();
if (branch !== mission.branch) throw new Error(`Expected branch ${mission.branch}; found ${branch || 'detached HEAD'}`);

const args = ['pr', 'create', '--draft', '--base', mission.baseBranch, '--head', mission.branch, '--title', mission.draftPullRequest.title];
const bodyPath = path.join(os.tmpdir(), `3dvr-${mission.id}-draft-body.md`);
await import('node:fs/promises').then(fs => fs.writeFile(bodyPath, `${mission.draftPullRequest.body}\n`));
args.push('--body-file', bodyPath);
console.log(`PLAN: gh ${args.map(value => JSON.stringify(value)).join(' ')}`);
if (!publish) {
  console.log('INSPECT-ONLY: pass --publish to open the draft pull request.');
} else {
  const url = await command('gh', args);
  console.log(`PUBLISHED DRAFT: ${url}`);
}
await import('node:fs/promises').then(fs => fs.rm(bodyPath, { force: true }));

import { execFile } from 'node:child_process';
import path from 'node:path';
import { loadMission, validateMission } from './validate-mission.mjs';

const repoRoot = path.resolve(new URL('../..', import.meta.url).pathname);
const missionId = process.argv[2];
if (!missionId) throw new Error('Usage: npm run agent:github -- <mission-id>');

function gh(args) {
  return new Promise((resolve, reject) => {
    execFile('gh', args, { cwd: repoRoot }, (error, stdout, stderr) => {
      if (error) reject(new Error(stderr.trim() || error.message));
      else resolve(stdout.trim());
    });
  });
}

const mission = await loadMission(path.join(repoRoot, 'docs/agent/missions', `${missionId}.yaml`));
const errors = validateMission(mission);
if (errors.length) throw new Error(errors.join('; '));
if (!mission.repository || !mission.pullRequests?.length) {
  console.log('No GitHub pull requests declared for this mission.');
} else {
  for (const number of mission.pullRequests) {
    const view = await gh(['pr', 'view', String(number), '--repo', mission.repository, '--json', 'number,title,state,isDraft,baseRefName,headRefName,headRefOid,mergeable,mergeStateStatus,changedFiles,url,statusCheckRollup']);
    console.log(view);
    const checks = await gh(['pr', 'checks', String(number), '--repo', mission.repository]);
    console.log(checks || 'No checks reported.');
  }
}

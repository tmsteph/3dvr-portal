const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const run = promisify(execFile);
async function gh(args, cwd) { const result = await run('gh', args, { cwd, maxBuffer: 4_000_000 }); return JSON.parse(result.stdout); }
async function inspectPullRequest(repo, number, cwd) { return gh(['pr','view',String(number),'--repo',repo,'--json','state,isDraft,baseRefName,headRefName,headRefOid,mergeStateStatus,reviewDecision,statusCheckRollup'], cwd); }
function checksPass(pr) { return (pr.statusCheckRollup || []).filter(check => check.name).every(check => check.conclusion === 'SUCCESS' || check.conclusion === 'SKIPPED'); }
module.exports = { checksPass, gh, inspectPullRequest };

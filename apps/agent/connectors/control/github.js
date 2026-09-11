const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const run = promisify(execFile);
const DEFAULT_REPO = process.env.THREEDVR_MCP_GITHUB_REPO || 'tmsteph/3dvr-portal';
const REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

function normalizeRepo(repo = DEFAULT_REPO) {
  const value = String(repo || '').trim();
  if (!REPO_PATTERN.test(value)) throw new Error('GitHub repo must use owner/name form.');
  return value;
}

async function ghJson(args, options = {}) {
  const { stdout } = await run('gh', args, {
    timeout: options.timeout || 8000,
    maxBuffer: 2_000_000,
    env: process.env,
  });
  return JSON.parse(stdout || 'null');
}

async function githubOverview({ repo = DEFAULT_REPO, limit = 10 } = {}) {
  const selectedRepo = normalizeRepo(repo);
  const selectedLimit = Math.max(1, Math.min(50, Number(limit) || 10));
  const [repository, pullRequests] = await Promise.all([
    ghJson([
      'repo', 'view', selectedRepo,
      '--json', 'nameWithOwner,description,defaultBranchRef,isPrivate,url',
    ]),
    ghJson([
      'pr', 'list', '--repo', selectedRepo, '--state', 'open',
      '--limit', String(selectedLimit),
      '--json', 'number,title,isDraft,updatedAt,url,headRefName,baseRefName,mergeStateStatus',
    ]),
  ]);

  return {
    repo: repository,
    openPullRequests: pullRequests,
    openPullRequestCountReturned: pullRequests.length,
  };
}

module.exports = {
  DEFAULT_REPO,
  githubOverview,
  normalizeRepo,
};

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
  authorizePortalOperatorTask,
  BUILTIN_OPERATOR_OWNER_BINDINGS,
} = require('../thomas-agent/node/operator-forge-auth');
const { editOnlyTask } = require('../thomas-agent/node/operator-forge-worker');

const TMSTEPH_PUB = 'Cg-NVNIbxWPDBqX7OmllJQqjxy2t3KA_U2DqQBjcPQ8.1fppECqamDOHh2tKt1G5t8Yd21NjBCZ3C6qunST3lvg';

function signedRecord(task) {
  return {
    id: 'operator-task-github-1',
    task,
    repo: 'portal',
    requestedBy: 'portal-operator',
    authPub: TMSTEPH_PUB,
    authProof: 'proof-1',
  };
}

test('tmsteph is the built-in Forge owner binding', () => {
  assert.equal(BUILTIN_OPERATOR_OWNER_BINDINGS['tmsteph@3dvr'], TMSTEPH_PUB);
});

test('verified tmsteph Forge request resolves as owner', async () => {
  const task = 'Operator code request: Fix the nav and push the commit to GitHub.';
  const repoPath = path.resolve('/srv/3dvr-portal');
  const result = await authorizePortalOperatorTask(signedRecord(task), {
    now: 1_001_000,
    env: { THREEDVR_OPERATOR_PORTAL_REPO: repoPath },
    verifyImpl: async () => ({
      scope: 'operator-forge-task',
      action: 'queue-code-change',
      alias: 'tmsteph@3dvr',
      pub: TMSTEPH_PUB,
      iat: 1_000_000,
      taskId: 'operator-task-github-1',
      repo: 'portal',
      task,
    }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.role, 'owner');
  assert.equal(result.repoPath, repoPath);
});

test('owner can authorize ordinary GitHub writes', () => {
  const result = editOnlyTask(
    signedRecord('Operator code request: Commit the fix, push it to GitHub, and open a PR.'),
    { role: 'owner' },
  );
  assert.equal(result.ok, true);
  assert.equal(result.githubWrite, true);
});

test('ordinary developer cannot authorize GitHub writes', () => {
  const result = editOnlyTask(
    signedRecord('Operator code request: Commit the fix and push it to GitHub.'),
    { role: 'developer' },
  );
  assert.equal(result.ok, false);
  assert.match(result.reason, /owner authorization/i);
});

test('owner permission still blocks destructive GitHub and deployment actions', () => {
  for (const task of [
    'Operator code request: Force-push this branch.',
    'Operator code request: Delete the repository.',
    'Operator code request: Deploy this to production.',
    'Operator code request: Change repository secrets.',
  ]) {
    const result = editOnlyTask(signedRecord(task), { role: 'owner' });
    assert.equal(result.ok, false, task);
  }
});

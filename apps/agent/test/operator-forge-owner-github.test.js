const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
  authorizePortalOperatorTask,
  BUILTIN_OPERATOR_OWNER_BINDINGS,
  BUILTIN_OPERATOR_OWNER_PUBS,
} = require('../thomas-agent/node/operator-forge-auth');
const { editOnlyTask } = require('../thomas-agent/node/operator-forge-worker');

const TMSTEPH_PUB = 'Cg-NVNIbxWPDBqX7OmllJQqjxy2t3KA_U2DqQBjcPQ8.1fppECqamDOHh2tKt1G5t8Yd21NjBCZ3C6qunST3lvg';

function signedRecord(task, githubWriteRequested = false) {
  return {
    id: 'operator-task-github-1',
    task,
    repo: 'portal',
    githubWriteRequested,
    requestedBy: 'portal-operator',
    authPub: TMSTEPH_PUB,
    authProof: 'proof-1',
  };
}

function verifiedOwnerTask(task, alias = 'tmsteph@3dvr', githubWriteRequested = true) {
  return {
    scope: 'operator-forge-task',
    action: 'queue-code-change',
    alias,
    pub: TMSTEPH_PUB,
    iat: 1_000_000,
    taskId: 'operator-task-github-1',
    repo: 'portal',
    task,
    githubWriteRequested,
  };
}

test('tmsteph is the built-in Forge owner binding', () => {
  assert.equal(BUILTIN_OPERATOR_OWNER_BINDINGS['tmsteph@3dvr'], TMSTEPH_PUB);
  assert.deepEqual(BUILTIN_OPERATOR_OWNER_PUBS, [TMSTEPH_PUB]);
});

test('verified tmsteph Forge request resolves as owner with signed GitHub permission', async () => {
  const task = 'Operator code request: Fix the nav and push the commit to GitHub.';
  const repoPath = path.resolve('/srv/3dvr-portal');
  const result = await authorizePortalOperatorTask(signedRecord(task, true), {
    now: 1_001_000,
    env: { THREEDVR_OPERATOR_PORTAL_REPO: repoPath },
    verifyImpl: async () => verifiedOwnerTask(task),
  });

  assert.equal(result.ok, true);
  assert.equal(result.role, 'owner');
  assert.equal(result.githubWriteApproved, true);
  assert.equal(result.repoPath, repoPath);
});

test('verified owner key survives a legacy tmsteph alias without suffix', async () => {
  const task = 'Operator code request: Fix the nav and push the commit to GitHub.';
  const result = await authorizePortalOperatorTask(signedRecord(task, true), {
    now: 1_001_000,
    env: {},
    verifyImpl: async () => verifiedOwnerTask(task, 'tmsteph'),
  });

  assert.equal(result.ok, true);
  assert.equal(result.role, 'owner');
  assert.equal(result.githubWriteApproved, true);
});

test('queued GitHub flag cannot be added after the owner signed the request', async () => {
  const task = 'Operator code request: Fix the nav spacing locally.';
  const result = await authorizePortalOperatorTask(signedRecord(task, true), {
    now: 1_001_000,
    env: {},
    verifyImpl: async () => verifiedOwnerTask(task, 'tmsteph@3dvr', false),
  });

  assert.equal(result.ok, false);
  assert.match(result.reason, /GitHub intent mismatch/i);
});

test('owner can authorize ordinary GitHub writes', () => {
  const result = editOnlyTask(
    signedRecord('Operator code request: Commit the fix, push it to GitHub, and open a PR.', true),
    { role: 'owner', githubWriteApproved: true },
  );
  assert.equal(result.ok, true);
  assert.equal(result.githubWrite, true);
});

test('local owner and developer edits are not misclassified as GitHub writes', () => {
  for (const role of ['owner', 'developer']) {
    const result = editOnlyTask(
      signedRecord('Operator code request: Fix the mobile navbar spacing locally.', false),
      { role, githubWriteApproved: false },
    );
    assert.equal(result.ok, true, role);
    assert.equal(result.githubWrite, false, role);
  }
});

test('ordinary developer cannot authorize GitHub writes', () => {
  const result = editOnlyTask(
    signedRecord('Operator code request: Commit the fix and push it to GitHub.', true),
    { role: 'developer', githubWriteApproved: false },
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
    const result = editOnlyTask(signedRecord(task, true), { role: 'owner', githubWriteApproved: true });
    assert.equal(result.ok, false, task);
  }
});

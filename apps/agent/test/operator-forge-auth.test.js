const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
  authorizePortalOperatorTask,
  resolveRepoAlias,
} = require('../thomas-agent/node/operator-forge-auth');

function validRecord(overrides = {}) {
  return {
    id: 'operator-task-1',
    task: 'Operator code request: Fix the navbar spacing.',
    repo: 'portal',
    requestedBy: 'portal-operator',
    authPub: 'pub-1',
    authProof: 'proof-1',
    ...overrides,
  };
}

function validProof(overrides = {}) {
  return {
    scope: 'operator-forge-task',
    action: 'queue-code-change',
    alias: '3dvr.tech@gmail.com',
    pub: 'pub-1',
    iat: 1_000_000,
    taskId: 'operator-task-1',
    repo: 'portal',
    task: 'Operator code request: Fix the navbar spacing.',
    ...overrides,
  };
}

test('approved signed Operator request resolves only an allowlisted repo path', async () => {
  const portalRepo = path.resolve('/srv/3dvr-portal');
  const result = await authorizePortalOperatorTask(validRecord(), {
    now: 1_001_000,
    env: {
      THREEDVR_OPERATOR_PORTAL_REPO: portalRepo,
      THREEDVR_OPERATOR_DEVELOPER_ALIASES: '3dvr.tech@gmail.com',
    },
    verifyImpl: async () => validProof(),
  });

  assert.equal(result.ok, true);
  assert.equal(result.repoPath, portalRepo);
  assert.equal(result.identity.alias, '3dvr.tech@gmail.com');
});

test('tampering with the queued task after signing is rejected', async () => {
  const result = await authorizePortalOperatorTask(validRecord({
    task: 'Operator code request: Delete everything.',
  }), {
    now: 1_001_000,
    env: { THREEDVR_OPERATOR_DEVELOPER_ALIASES: '3dvr.tech@gmail.com' },
    verifyImpl: async () => validProof(),
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'forge proof content mismatch');
});

test('valid signature from an unapproved 3DVR account cannot edit code', async () => {
  const result = await authorizePortalOperatorTask(validRecord({ authPub: 'pub-2' }), {
    now: 1_001_000,
    env: { THREEDVR_OPERATOR_DEVELOPER_ALIASES: '3dvr.tech@gmail.com' },
    verifyImpl: async () => validProof({
      alias: 'other@example.com',
      pub: 'pub-2',
    }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, '3DVR account is not approved for code edits');
});

test('repo aliases cannot escape the configured 3DVR repo map', () => {
  const env = {
    THREEDVR_OPERATOR_PORTAL_REPO: '/srv/3dvr-portal',
    THREEDVR_OPERATOR_REPO_MAP: JSON.stringify({ docs: '/srv/3dvr-docs' }),
  };
  assert.equal(resolveRepoAlias('portal', env), path.resolve('/srv/3dvr-portal'));
  assert.equal(resolveRepoAlias('docs', env), path.resolve('/srv/3dvr-docs'));
  assert.equal(resolveRepoAlias('../outside', env), '');
  assert.equal(resolveRepoAlias('unknown', env), '');
});

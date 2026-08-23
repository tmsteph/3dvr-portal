const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
  authorizePortalOperatorTask,
  resolveRepoAlias,
  BUILTIN_OPERATOR_DEVELOPER_BINDINGS,
} = require('../thomas-agent/node/operator-forge-auth');

const TMSTEPH_PUB = 'Cg-NVNIbxWPDBqX7OmllJQqjxy2t3KA_U2DqQBjcPQ8.1fppECqamDOHh2tKt1G5t8Yd21NjBCZ3C6qunST3lvg';

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

test('built-in worker policy binds tmsteph alias to the exact SEA public key', () => {
  assert.equal(BUILTIN_OPERATOR_DEVELOPER_BINDINGS['tmsteph@3dvr'], TMSTEPH_PUB);
});

test('built-in tmsteph SEA binding authorizes an Operator edit request', async () => {
  const portalRepo = path.resolve('/srv/3dvr-portal');
  const result = await authorizePortalOperatorTask(validRecord({ authPub: TMSTEPH_PUB }), {
    now: 1_001_000,
    env: { THREEDVR_OPERATOR_PORTAL_REPO: portalRepo },
    verifyImpl: async () => validProof({
      alias: 'tmsteph@3dvr',
      pub: TMSTEPH_PUB,
    }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.repoPath, portalRepo);
  assert.equal(result.identity.alias, 'tmsteph@3dvr');
  assert.equal(result.identity.pub, TMSTEPH_PUB);
});

test('approved signed Operator request resolves only an allowlisted repo path', async () => {
  const portalRepo = path.resolve('/srv/3dvr-portal');
  const result = await authorizePortalOperatorTask(validRecord(), {
    now: 1_001_000,
    env: {
      THREEDVR_OPERATOR_PORTAL_REPO: portalRepo,
      THREEDVR_OPERATOR_DEVELOPER_PUBS: 'pub-1',
    },
    verifyImpl: async () => validProof(),
  });

  assert.equal(result.ok, true);
  assert.equal(result.repoPath, portalRepo);
  assert.equal(result.identity.alias, '3dvr.tech@gmail.com');
});

test('unsigned or unknown Forge producers are rejected', async () => {
  const result = await authorizePortalOperatorTask(validRecord({
    requestedBy: 'attacker-controlled-client',
    authProof: '',
    repo: '/tmp/escape',
  }), {
    env: { THREEDVR_OPERATOR_DEVELOPER_PUBS: 'pub-1' },
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'untrusted forge request producer');
});

test('tampering with the queued task after signing is rejected', async () => {
  const result = await authorizePortalOperatorTask(validRecord({
    task: 'Operator code request: Delete everything.',
  }), {
    now: 1_001_000,
    env: { THREEDVR_OPERATOR_DEVELOPER_PUBS: 'pub-1' },
    verifyImpl: async () => validProof(),
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'forge proof content mismatch');
});

test('claiming an approved alias with a different SEA key is rejected', async () => {
  const result = await authorizePortalOperatorTask(validRecord({ authPub: 'pub-evil' }), {
    now: 1_001_000,
    env: {
      THREEDVR_OPERATOR_DEVELOPER_BINDINGS: JSON.stringify({
        '3dvr.tech@gmail.com': 'pub-1',
      }),
    },
    verifyImpl: async () => validProof({
      alias: '3dvr.tech@gmail.com',
      pub: 'pub-evil',
    }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, '3DVR account is not approved for code edits');
});

test('claiming tmsteph alias with a different SEA key is rejected', async () => {
  const result = await authorizePortalOperatorTask(validRecord({ authPub: 'pub-evil' }), {
    now: 1_001_000,
    env: {},
    verifyImpl: async () => validProof({
      alias: 'tmsteph@3dvr',
      pub: 'pub-evil',
    }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, '3DVR account is not approved for code edits');
});

test('valid alias-to-public-key binding can authorize a developer', async () => {
  const result = await authorizePortalOperatorTask(validRecord(), {
    now: 1_001_000,
    env: {
      THREEDVR_OPERATOR_DEVELOPER_BINDINGS: JSON.stringify({
        '3dvr.tech@gmail.com': 'pub-1',
      }),
    },
    verifyImpl: async () => validProof(),
  });

  assert.equal(result.ok, true);
});

test('queued authorization remains valid beyond five minutes by default', async () => {
  const result = await authorizePortalOperatorTask(validRecord(), {
    now: 1_600_000,
    env: { THREEDVR_OPERATOR_DEVELOPER_PUBS: 'pub-1' },
    verifyImpl: async () => validProof(),
  });

  assert.equal(result.ok, true);
});

test('valid signature from an unapproved 3DVR account cannot edit code', async () => {
  const result = await authorizePortalOperatorTask(validRecord({ authPub: 'pub-2' }), {
    now: 1_001_000,
    env: { THREEDVR_OPERATOR_DEVELOPER_PUBS: 'pub-1' },
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

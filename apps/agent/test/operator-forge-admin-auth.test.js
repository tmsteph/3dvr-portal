const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
  authorizePortalOperatorTask,
  BUILTIN_OPERATOR_ADMIN_BINDINGS,
} = require('../thomas-agent/node/operator-forge-auth');

const ASSISTANT_ALIAS = 'chatgpt-operator-e18d7ed6@3dvr';
const ASSISTANT_PUB = 'jcsaMMOmGSjWVJOtiPHI3hZWsudATRhOglXRdDatfSA.pzn7gtgVsDxfbV_md8B4a_W4eNTOavwnZwFU0qOtYcU';

function record(overrides = {}) {
  return {
    id: 'operator-task-admin-1',
    task: 'Operator code request: Add a harmless test comment.',
    repo: 'portal',
    requestedBy: 'portal-operator',
    authPub: ASSISTANT_PUB,
    authProof: 'proof-admin',
    ...overrides,
  };
}

function proof(overrides = {}) {
  return {
    scope: 'operator-forge-task',
    action: 'queue-code-change',
    alias: ASSISTANT_ALIAS,
    pub: ASSISTANT_PUB,
    iat: 1_000_000,
    taskId: 'operator-task-admin-1',
    repo: 'portal',
    task: 'Operator code request: Add a harmless test comment.',
    ...overrides,
  };
}

test('Forge worker binds assistant admin alias to the exact SEA public key', () => {
  assert.equal(BUILTIN_OPERATOR_ADMIN_BINDINGS[ASSISTANT_ALIAS], ASSISTANT_PUB);
});

test('Forge worker authorizes the assistant admin for portal edits', async () => {
  const portalRepo = path.resolve('/srv/3dvr-portal');
  const result = await authorizePortalOperatorTask(record(), {
    now: 1_001_000,
    env: { THREEDVR_OPERATOR_PORTAL_REPO: portalRepo },
    verifyImpl: async () => proof(),
  });

  assert.equal(result.ok, true);
  assert.equal(result.role, 'admin');
  assert.equal(result.repoPath, portalRepo);
  assert.equal(result.identity.alias, ASSISTANT_ALIAS);
  assert.equal(result.identity.pub, ASSISTANT_PUB);
});

test('Forge worker rejects an admin alias presented with a different SEA key', async () => {
  const result = await authorizePortalOperatorTask(record({ authPub: 'pub-evil' }), {
    now: 1_001_000,
    env: {},
    verifyImpl: async () => proof({ pub: 'pub-evil' }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, '3DVR account is not approved for code edits');
});

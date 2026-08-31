const assert = require('node:assert/strict');
const test = require('node:test');
const { authorizeWorkspaceControlRecord, workspaceIdForIdentity } = require('../thomas-agent/node/freelancer-workspace-auth');

function fixture(overrides = {}) {
  const identity = { alias: 'worker@example.com', pub: 'pub-1234567890' };
  const workspaceId = workspaceIdForIdentity(identity);
  const verified = {
    scope: 'freelancer-workspace-control-v1',
    action: 'start',
    requestId: 'req_12345678',
    workspaceId,
    pub: identity.pub,
    alias: identity.alias,
    timezone: 'America/Los_Angeles',
    iat: 1788141600000,
    ...overrides.verified,
  };
  const record = {
    id: verified.requestId,
    workspaceId: verified.workspaceId,
    action: verified.action,
    authPub: identity.pub,
    authProof: 'signed-proof',
    status: 'queued',
    ...overrides.record,
  };
  return { record, verified };
}

test('signed control record is bound to its signing identity and workspace', async () => {
  const { record, verified } = fixture();
  const result = await authorizeWorkspaceControlRecord(record, {
    now: 1788141601000,
    verifyImpl: async () => verified,
    env: {},
  });
  assert.equal(result.ok, true);
  assert.equal(result.action, 'start');
  assert.equal(result.workspaceId, record.workspaceId);
});

test('provisioning is denied unless the host explicitly enables it', async () => {
  const { record, verified } = fixture({ verified: { action: 'provision' } });
  record.action = 'provision';
  const denied = await authorizeWorkspaceControlRecord(record, {
    now: 1788141601000,
    verifyImpl: async () => verified,
    env: {},
  });
  assert.equal(denied.ok, false);
  assert.match(denied.reason, /disabled/);
  const allowed = await authorizeWorkspaceControlRecord(record, {
    now: 1788141601000,
    verifyImpl: async () => verified,
    env: { FREELANCER_WORKSPACE_ALLOW_PROVISION: 'true' },
  });
  assert.equal(allowed.ok, true);
});

test('replayed and cross-workspace requests are rejected', async () => {
  const expired = fixture();
  const expiredResult = await authorizeWorkspaceControlRecord(expired.record, {
    now: 1788141600000 + 10 * 60 * 1000,
    verifyImpl: async () => expired.verified,
    env: {},
  });
  assert.equal(expiredResult.ok, false);
  assert.match(expiredResult.reason, /expired/);

  const crossed = fixture({ record: { workspaceId: 'fw-someone-else' } });
  const crossedResult = await authorizeWorkspaceControlRecord(crossed.record, {
    now: 1788141601000,
    verifyImpl: async () => crossed.verified,
    env: {},
  });
  assert.equal(crossedResult.ok, false);
});

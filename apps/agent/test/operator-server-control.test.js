const assert = require('node:assert/strict');
const test = require('node:test');

const {
  authorizePortalServerControl,
} = require('../thomas-agent/node/operator-server-control-auth');
const {
  executeServerControl,
} = require('../thomas-agent/node/operator-server-control-worker');

function record(overrides = {}) {
  return {
    id: 'server-control-1',
    server: 'ovh',
    operation: 'service_restart',
    service: '3dvr-personal-mcp.service',
    requestedBy: 'portal-operator',
    authPub: 'tmsteph-pub',
    authProof: 'proof',
    ...overrides,
  };
}

function verified(overrides = {}) {
  return {
    scope: 'operator-server-control',
    action: 'queue-server-control',
    pub: 'tmsteph-pub',
    alias: 'tmsteph@3dvr',
    iat: 1000,
    requestId: 'server-control-1',
    server: 'ovh',
    operation: 'service_restart',
    service: '3dvr-personal-mcp.service',
    ...overrides,
  };
}

test('server control accepts only exact signed owner requests', async () => {
  const auth = await authorizePortalServerControl(record(), {
    now: 2000,
    env: { THREEDVR_OPERATOR_OWNER_BINDINGS: JSON.stringify({ 'tmsteph@3dvr': 'tmsteph-pub' }) },
    verifyImpl: async () => verified(),
  });
  assert.equal(auth.ok, true);
  assert.equal(auth.server, 'ovh');
  assert.equal(auth.operation, 'service_restart');

  const changed = await authorizePortalServerControl(record({ service: 'openbao.service' }), {
    now: 2000,
    env: { THREEDVR_OPERATOR_OWNER_BINDINGS: JSON.stringify({ 'tmsteph@3dvr': 'tmsteph-pub' }) },
    verifyImpl: async () => verified(),
  });
  assert.equal(changed.ok, false);
  assert.match(changed.reason, /service mismatch/);
});

test('server control rejects non-owner and non-allowlisted service actions', async () => {
  const nonOwner = await authorizePortalServerControl(record(), {
    now: 2000,
    env: {},
    verifyImpl: async () => verified({ alias: 'someone@3dvr' }),
  });
  assert.equal(nonOwner.ok, false);
  assert.match(nonOwner.reason, /restricted to the tmsteph owner identity/);

  const arbitrary = await authorizePortalServerControl(record({
    service: 'ssh.service',
  }), {
    now: 2000,
    env: { THREEDVR_OPERATOR_OWNER_BINDINGS: JSON.stringify({ 'tmsteph@3dvr': 'tmsteph-pub' }) },
    verifyImpl: async () => verified({ service: 'ssh.service' }),
  });
  assert.equal(arbitrary.ok, false);
  assert.match(arbitrary.reason, /not allowlisted/);
});

test('server control worker routes health and service operations only through typed control connectors', async () => {
  const health = await executeServerControl({
    server: 'hetzner', operation: 'health', service: '',
  }, {
    serversHealthImpl: async ({ servers }) => ({ ok: true, servers }),
  });
  assert.deepEqual(health.servers, ['hetzner']);

  let called;
  const restart = await executeServerControl({
    server: 'ovh', operation: 'service_restart', service: 'openbao.service',
  }, {
    callOvhToolImpl: async (name, args) => {
      called = { name, args };
      return { activeState: 'active' };
    },
  });
  assert.deepEqual(called, {
    name: 'service_restart',
    args: { service: 'openbao.service' },
  });
  assert.equal(restart.activeState, 'active');
});


test('server control rejects another configured owner identity', async () => {
  const auth = await authorizePortalServerControl(record({ authPub: 'other-owner-pub' }), {
    now: 2000,
    env: { THREEDVR_OPERATOR_OWNER_BINDINGS: JSON.stringify({ 'tmsteph@3dvr': 'tmsteph-pub', 'other@3dvr': 'other-owner-pub' }) },
    verifyImpl: async () => verified({ pub: 'other-owner-pub', alias: 'other@3dvr' }),
  });
  assert.equal(auth.ok, false);
  assert.match(auth.reason, /tmsteph owner identity/);
});
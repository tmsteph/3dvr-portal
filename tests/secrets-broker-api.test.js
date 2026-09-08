import assert from 'node:assert/strict';
import test from 'node:test';
import { createSecretsBrokerHandler } from '../api/secrets-broker.js';
import { BUILTIN_OPERATOR_OWNER_BINDINGS } from '../src/operator/developer-access.js';

const OWNER_ALIAS = 'tmsteph@3dvr';
const OWNER_PUB = BUILTIN_OPERATOR_OWNER_BINDINGS[OWNER_ALIAS];

function response() {
  return {
    statusCode: 200, body: null, headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };
}

function verification({ alias = OWNER_ALIAS, pub = OWNER_PUB, action = 'status', approvalId = '' } = {}) {
  return async () => ({
    ok: true,
    identity: { alias, pub, action, origin: 'https://portal.3dvr.tech', issuedAt: Date.now(), scope: 'secrets-broker-owner' },
    verified: { alias, pub, action, approvalId, scope: 'secrets-broker-owner' },
  });
}

function request(body) {
  return { method: 'POST', headers: { host: 'portal.3dvr.tech', 'x-forwarded-proto': 'https' }, body };
}

test('owner can read sanitized broker status through OVH socket bridge', async () => {
  let brokerCall;
  const handler = createSecretsBrokerHandler({
    config: {}, verify: verification(),
    brokerRequest: async input => { brokerCall = input; return { status: 200, body: { ok: true, controlNode: 'ovh' } }; },
  });
  const res = response();
  await handler(request({ action: 'status', origin: 'https://portal.3dvr.tech' }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.controlNode, 'ovh');
  assert.deepEqual(brokerCall, { method: 'GET', path: '/v1/status' });
});

test('non-owner signed identity cannot manage broker', async () => {
  const handler = createSecretsBrokerHandler({
    config: {}, verify: verification({ alias: 'someone@3dvr', pub: 'other-pub' }),
    brokerRequest: async () => { throw new Error('must not run'); },
  });
  const res = response();
  await handler(request({ action: 'status', origin: 'https://portal.3dvr.tech' }), res);
  assert.equal(res.statusCode, 403);
  assert.match(res.body.error, /owner/i);
});

test('signed action is bound to requested action', async () => {
  const handler = createSecretsBrokerHandler({ config: {}, verify: verification({ action: 'approvals' }) });
  const res = response();
  await handler(request({ action: 'status', origin: 'https://portal.3dvr.tech' }), res);
  assert.equal(res.statusCode, 401);
  assert.match(res.body.error, /action/i);
});

test('approval decision proof is bound to the concrete approval id', async () => {
  const handler = createSecretsBrokerHandler({ config: {}, verify: verification({ action: 'approve', approvalId: 'apr-one-1234567890' }) });
  const res = response();
  await handler(request({ action: 'approve', approvalId: 'apr-two-1234567890', origin: 'https://portal.3dvr.tech' }), res);
  assert.equal(res.statusCode, 401);
  assert.match(res.body.error, /approval/i);
});

test('owner approval maps to exact local broker endpoint', async () => {
  let brokerCall;
  const approvalId = 'apr-12345678-1234-1234-1234-123456789abc';
  const handler = createSecretsBrokerHandler({
    config: {}, verify: verification({ action: 'approve', approvalId }),
    brokerRequest: async input => { brokerCall = input; return { status: 200, body: { ok: true } }; },
  });
  const res = response();
  await handler(request({ action: 'approve', approvalId, origin: 'https://portal.3dvr.tech' }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(brokerCall.method, 'POST');
  assert.equal(brokerCall.path, `/v1/approvals/${approvalId}/approve`);
  assert.equal(brokerCall.payload.actor, OWNER_ALIAS);
});

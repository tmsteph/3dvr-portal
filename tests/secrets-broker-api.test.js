import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { configureBitwardenMachineAccess, createSecretsBrokerHandler } from '../api/secrets-broker.js';
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

function verification({ alias = OWNER_ALIAS, pub = OWNER_PUB, action = 'status', approvalId = '', accessTokenHash = '' } = {}) {
  return async () => ({
    ok: true,
    identity: { alias, pub, action, origin: 'https://portal.3dvr.tech', issuedAt: Date.now(), scope: 'secrets-broker-owner' },
    verified: { alias, pub, action, approvalId, accessTokenHash, scope: 'secrets-broker-owner' },
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

test('owner proof origin is bound to the receiving request host, not the request body', async () => {
  let expectedOrigin;
  const baseVerify = verification();
  const handler = createSecretsBrokerHandler({
    config: {},
    verify: async (body, options) => {
      expectedOrigin = options.expectedOrigin;
      return baseVerify(body, options);
    },
    brokerRequest: async () => ({ status: 200, body: { ok: true } }),
  });
  const res = response();
  await handler(request({ action: 'status', origin: 'https://attacker.example' }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(expectedOrigin, 'https://portal.3dvr.tech');
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

test('owner can hand Bitwarden machine access directly to OVH without echoing the token', async () => {
  const token = 'example-machine-access-token-1234567890';
  let configured = '';
  const handler = createSecretsBrokerHandler({
    config: { THREEDVR_CONTROL_NODE: 'ovh' },
    verify: verification({ action: 'configure-bitwarden', accessTokenHash: createHash('sha256').update(token).digest('hex') }),
    configureBitwarden: async value => { configured = value; return { ok: true, configured: true }; },
  });
  const res = response();
  await handler(request({ action: 'configure-bitwarden', accessToken: token, origin: 'https://portal.3dvr.tech' }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(configured, token);
  assert.deepEqual(res.body, { ok: true, configured: true });
  assert.equal(JSON.stringify(res.body).includes(token), false);
});

test('Bitwarden handoff remains owner-proof gated', async () => {
  let called = false;
  const handler = createSecretsBrokerHandler({
    config: { THREEDVR_CONTROL_NODE: 'ovh' },
    verify: verification({ alias: 'someone@3dvr', pub: 'other-pub', action: 'configure-bitwarden', accessTokenHash: createHash('sha256').update('example-machine-access-token-1234567890').digest('hex') }),
    configureBitwarden: async () => { called = true; return { ok: true }; },
  });
  const res = response();
  await handler(request({ action: 'configure-bitwarden', accessToken: 'example-machine-access-token-1234567890' }), res);
  assert.equal(res.statusCode, 403);
  assert.equal(called, false);
});


test('invalid Bitwarden machine access never overwrites an existing broker credential', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), '3dvr-bws-'));
  const envFile = path.join(dir, 'bitwarden.env');
  fs.writeFileSync(envFile, 'BWS_ACCESS_TOKEN=known-good-token\n');
  try {
    assert.throws(() => configureBitwardenMachineAccess({
      config: { THREEDVR_CONTROL_NODE: 'ovh', THREEDVR_SECRETS_BROKER_BITWARDEN_ENV: envFile },
      accessToken: 'bad-machine-access-token-1234567890',
      run: () => ({ status: 1 }),
    }), /existing broker credential was left unchanged/i);
    assert.equal(fs.readFileSync(envFile, 'utf8'), 'BWS_ACCESS_TOKEN=known-good-token\n');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

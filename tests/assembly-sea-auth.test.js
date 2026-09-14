import test from 'node:test';
import assert from 'node:assert/strict';
import SEA from 'gun/sea.js';
import { PERMISSIONS } from '../assembly/permissions.js';
import {
  ASSEMBLY_AUTH_SCOPE,
  authorizeAssemblyRequest,
  verifyAssemblyPrincipal,
} from '../src/assembly/auth.js';

async function signedPayload({
  pair,
  workspaceId = 'asm_1',
  action = PERMISSIONS.WRITE,
  origin = 'https://portal.3dvr.tech',
  iat = 1000,
} = {}) {
  const signed = {
    scope: ASSEMBLY_AUTH_SCOPE,
    action,
    alias: 'ava@3dvr',
    pub: pair.pub,
    origin,
    workspaceId,
    iat,
  };
  return {
    authPub: pair.pub,
    authProof: await SEA.sign(signed, pair),
    workspaceId,
    action,
  };
}

test('valid SEA proof becomes a strong authenticated Assembly principal', async () => {
  const pair = await SEA.pair();
  const payload = await signedPayload({ pair });
  const result = await verifyAssemblyPrincipal(payload, {
    workspaceId: 'asm_1',
    permission: PERMISSIONS.WRITE,
    expectedOrigin: 'https://portal.3dvr.tech',
    now: 1000,
    maxAgeMs: 60_000,
  });

  assert.equal(result.ok, true);
  assert.equal(result.principal.id, `sea:${pair.pub}`);
  assert.equal(result.principal.issuer, 'gun-sea');
  assert.equal(result.principal.assurance, 'strong');
  assert.equal(result.workspaceId, 'asm_1');
  assert.equal(result.permission, PERMISSIONS.WRITE);
});

test('workspace and capability must be inside the signed SEA proof', async () => {
  const pair = await SEA.pair();
  const payload = await signedPayload({ pair, workspaceId: 'asm_1', action: PERMISSIONS.READ });

  const wrongWorkspace = await verifyAssemblyPrincipal(payload, {
    workspaceId: 'asm_other',
    permission: PERMISSIONS.READ,
    expectedOrigin: 'https://portal.3dvr.tech',
    now: 1000,
    maxAgeMs: 60_000,
  });
  assert.equal(wrongWorkspace.ok, false);
  assert.match(wrongWorkspace.reason, /workspace/);

  const wrongCapability = await verifyAssemblyPrincipal(payload, {
    workspaceId: 'asm_1',
    permission: PERMISSIONS.WRITE,
    expectedOrigin: 'https://portal.3dvr.tech',
    now: 1000,
    maxAgeMs: 60_000,
  });
  assert.equal(wrongCapability.ok, false);
  assert.match(wrongCapability.reason, /capability/);
});

test('verified principal still needs an active grant', async () => {
  const pair = await SEA.pair();
  const payload = await signedPayload({ pair });
  const grant = {
    grantId: 'grant_1',
    workspaceId: 'asm_1',
    principalId: `sea:${pair.pub}`,
    profile: 'editor',
    issuedBy: 'sea:owner',
    sourceInviteId: 'invite_1',
    grantedAt: 1,
    revokedAt: null,
  };

  const allowed = await authorizeAssemblyRequest(payload, {
    workspaceId: 'asm_1',
    permission: PERMISSIONS.WRITE,
    expectedOrigin: 'https://portal.3dvr.tech',
    now: 1000,
    maxAgeMs: 60_000,
    grants: [grant],
  });
  assert.equal(allowed.ok, true);
  assert.equal(allowed.authorization.profile, 'editor');

  const denied = await authorizeAssemblyRequest(payload, {
    workspaceId: 'asm_1',
    permission: PERMISSIONS.WRITE,
    expectedOrigin: 'https://portal.3dvr.tech',
    now: 1000,
    maxAgeMs: 60_000,
    grants: [],
  });
  assert.deepEqual(denied.authorization, undefined);
  assert.equal(denied.ok, false);
  assert.equal(denied.reason, 'no-active-grant');
});

test('wrong origin, expired proof, and tampered signature are rejected', async () => {
  const pair = await SEA.pair();
  const payload = await signedPayload({ pair, iat: 1000 });

  const wrongOrigin = await verifyAssemblyPrincipal(payload, {
    expectedOrigin: 'https://evil.example',
    now: 1000,
    maxAgeMs: 60_000,
  });
  assert.equal(wrongOrigin.ok, false);

  const expired = await verifyAssemblyPrincipal(payload, {
    expectedOrigin: 'https://portal.3dvr.tech',
    now: 100_000,
    maxAgeMs: 1_000,
  });
  assert.equal(expired.ok, false);

  const tampered = await verifyAssemblyPrincipal({ ...payload, authProof: `${payload.authProof}tampered` }, {
    expectedOrigin: 'https://portal.3dvr.tech',
    now: 1000,
    maxAgeMs: 60_000,
  });
  assert.equal(tampered.ok, false);
});

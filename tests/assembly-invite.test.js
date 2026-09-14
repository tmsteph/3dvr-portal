import test from 'node:test';
import assert from 'node:assert/strict';
import { PERMISSIONS } from '../assembly/permissions.js';
import {
  acceptWorkspaceInvite,
  createWorkspaceInvite,
  grantAllows,
  inviteSigningPayload,
  revokeWorkspaceGrant,
  sealWorkspaceInvite,
  validateWorkspaceInvite,
} from '../assembly/invite-contract.js';

const verifyProof = (payload, proof, issuer) => proof === `signed:${issuer}:${payload.length}`;
const sign = invite => sealWorkspaceInvite(
  invite,
  `signed:${invite.issuerPrincipalId}:${inviteSigningPayload(invite).length}`,
);

test('Assembly invites bind workspace, issuer, recipient, profile and expiry', () => {
  const invite = createWorkspaceInvite({
    workspaceId: 'asm_1',
    issuerPrincipalId: 'person_owner',
    recipientPrincipalId: 'person_editor',
    profile: 'editor',
    expiresAt: 200,
  }, { now: 100, idFactory: () => 'invite_1' });

  assert.equal(invite.inviteId, 'invite_1');
  assert.equal(invite.workspaceId, 'asm_1');
  assert.equal(invite.profile, 'editor');
  assert.equal(invite.proof, '');
});

test('sealed invites require proof verification and reject expiry', () => {
  const signed = sign(createWorkspaceInvite({
    workspaceId: 'asm_1',
    issuerPrincipalId: 'owner',
    recipientPrincipalId: 'viewer',
    profile: 'viewer',
    expiresAt: 200,
  }, { now: 100, idFactory: () => 'invite_2' }));

  assert.equal(validateWorkspaceInvite(signed, { now: 150, verifyProof }).inviteId, 'invite_2');
  assert.throws(() => validateWorkspaceInvite(signed, { now: 201, verifyProof }), /expired/);
  assert.throws(() => validateWorkspaceInvite({ ...signed, proof: 'bad' }, { now: 150, verifyProof }), /invalid/);
});

test('acceptance creates a revocable grant for the exact recipient', () => {
  const signed = sign(createWorkspaceInvite({
    workspaceId: 'asm_2',
    issuerPrincipalId: 'owner',
    recipientPrincipalId: 'editor',
    profile: 'editor',
    expiresAt: 500,
  }, { now: 100, idFactory: () => 'invite_3' }));

  const grant = acceptWorkspaceInvite(signed, { recipientPrincipalId: 'editor' }, {
    now: 150,
    verifyProof,
    grantIdFactory: () => 'grant_1',
  });

  assert.equal(grant.grantId, 'grant_1');
  assert.equal(grant.sourceInviteId, 'invite_3');
  assert.equal(grantAllows(grant, PERMISSIONS.WRITE), true);
  assert.equal(grantAllows(grant, PERMISSIONS.MANAGE_ACCESS), false);
  assert.throws(() => acceptWorkspaceInvite(signed, { recipientPrincipalId: 'other' }, { now: 150, verifyProof }), /does not match/);

  const revoked = revokeWorkspaceGrant(grant, 160);
  assert.equal(revoked.revokedAt, 160);
  assert.equal(grantAllows(revoked, PERMISSIONS.READ), false);
});

test('invalid authorization profiles cannot be invited', () => {
  assert.throws(() => createWorkspaceInvite({
    workspaceId: 'asm_1',
    issuerPrincipalId: 'owner',
    recipientPrincipalId: 'guest',
    profile: 'admin-ish',
    expiresAt: 200,
  }, { now: 100 }), /Unknown authorization profile/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { authorizeWorkspaceCapability } from '../assembly/authorization.js';
import { PERMISSIONS, createLocalOwnerPrincipal } from '../assembly/permissions.js';
import { createAuthenticatedPrincipal } from '../assembly/principal-contract.js';

const editorGrant = {
  grantId: 'grant_editor',
  workspaceId: 'asm_1',
  principalId: 'person_1',
  profile: 'editor',
  issuedBy: 'owner',
  sourceInviteId: 'invite_1',
  grantedAt: 1,
  revokedAt: null,
};

test('local owner is authorized only for its own workspace', () => {
  const principal = createLocalOwnerPrincipal('asm_1');
  assert.equal(authorizeWorkspaceCapability({
    principal,
    workspaceId: 'asm_1',
    permission: PERMISSIONS.MANAGE_ACCESS,
  }).allowed, true);

  assert.deepEqual(authorizeWorkspaceCapability({
    principal,
    workspaceId: 'asm_2',
    permission: PERMISSIONS.READ,
  }), { allowed: false, reason: 'workspace-mismatch' });
});

test('authenticated principals require an active matching grant', () => {
  const principal = createAuthenticatedPrincipal({
    id: 'person_1',
    type: 'user',
    issuer: '3dvr-id',
    subject: 'user-123',
    displayName: 'Ava',
  }, { now: 10 });

  const result = authorizeWorkspaceCapability({
    principal,
    workspaceId: 'asm_1',
    permission: PERMISSIONS.WRITE,
    grants: [editorGrant],
  });
  assert.deepEqual(result, {
    allowed: true,
    reason: 'grant',
    profile: 'editor',
    grantId: 'grant_editor',
  });

  assert.deepEqual(authorizeWorkspaceCapability({
    principal,
    workspaceId: 'asm_1',
    permission: PERMISSIONS.MANAGE_ACCESS,
    grants: [editorGrant],
  }), { allowed: false, reason: 'grant-insufficient' });
});

test('revoked, mismatched, and malformed principals are denied', () => {
  const principal = createAuthenticatedPrincipal({
    id: 'person_1',
    type: 'user',
    issuer: '3dvr-id',
    subject: 'user-123',
  }, { now: 10 });

  assert.deepEqual(authorizeWorkspaceCapability({
    principal,
    workspaceId: 'asm_1',
    permission: PERMISSIONS.READ,
    grants: [{ ...editorGrant, revokedAt: 20 }],
  }), { allowed: false, reason: 'no-active-grant' });

  assert.deepEqual(authorizeWorkspaceCapability({
    principal: { id: 'broken', type: 'user' },
    workspaceId: 'asm_1',
    permission: PERMISSIONS.READ,
    grants: [editorGrant],
  }), { allowed: false, reason: 'principal-not-authenticated' });

  assert.deepEqual(authorizeWorkspaceCapability({
    principal,
    workspaceId: 'asm_2',
    permission: PERMISSIONS.READ,
    grants: [editorGrant],
  }), { allowed: false, reason: 'no-active-grant' });
});

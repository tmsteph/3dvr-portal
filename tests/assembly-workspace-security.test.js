import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createAssemblySnapshot,
  ensureWorkspaceIdentity,
  normalizeAssemblyState,
} from '../assembly/data.js';
import {
  PERMISSIONS,
  can,
  createLocalOwnerPrincipal,
  permissionsForProfile,
} from '../assembly/permissions.js';
import {
  createSyncEnvelope,
  fingerprintAssemblyState,
  validateSyncEnvelope,
} from '../assembly/sync-contract.js';

test('Assembly assigns one stable workspace identity and preserves it', () => {
  const first = ensureWorkspaceIdentity({ identity: { name: 'Garden' } }, {
    idFactory: () => 'asm_test_workspace',
    now: 42,
  });
  const second = ensureWorkspaceIdentity(first, {
    idFactory: () => 'asm_should_not_replace',
    now: 99,
  });

  assert.equal(first.workspace.id, 'asm_test_workspace');
  assert.equal(first.workspace.createdAt, 42);
  assert.deepEqual(second.workspace, first.workspace);
  assert.equal(createAssemblySnapshot(first).state.workspace.id, 'asm_test_workspace');
});

test('legacy Assembly state remains valid before identity migration', () => {
  const state = normalizeAssemblyState({ identity: { name: 'Legacy' } });
  assert.deepEqual(state.workspace, { id: '', createdAt: 0 });
});

test('authorization profiles are separate from organizational role labels', () => {
  assert.equal(can('owner', PERMISSIONS.MANAGE_ACCESS), true);
  assert.equal(can('editor', PERMISSIONS.WRITE), true);
  assert.equal(can('editor', PERMISSIONS.MANAGE_ACCESS), false);
  assert.equal(can('viewer', PERMISSIONS.WRITE), false);
  assert.deepEqual(permissionsForProfile('unknown'), []);

  const principal = createLocalOwnerPrincipal('asm_123');
  assert.deepEqual(principal, {
    type: 'local-owner',
    workspaceId: 'asm_123',
    profile: 'owner',
  });
});

test('sync envelopes bind state to a stable workspace and fingerprint', () => {
  const state = ensureWorkspaceIdentity({
    identity: { name: 'Builders' },
    commitments: [{ id: 'c1', text: 'Ship', owner: 'Ava', done: false, createdAt: 1 }],
  }, { idFactory: () => 'asm_sync', now: 1 });

  const envelope = createSyncEnvelope(state, {
    baseVersion: 'v1-old',
    deviceId: 'device-a',
    now: 2,
  });

  assert.equal(envelope.workspaceId, 'asm_sync');
  assert.equal(envelope.stateVersion, fingerprintAssemblyState(state));
  assert.equal(envelope.baseVersion, 'v1-old');
  assert.equal(validateSyncEnvelope(envelope).state.workspace.id, 'asm_sync');

  assert.throws(() => validateSyncEnvelope({
    ...envelope,
    stateVersion: 'v1-tampered',
  }), /fingerprint mismatch/);
});

test('sync cannot start without workspace identity', () => {
  assert.throws(() => createSyncEnvelope({ identity: { name: 'No ID' } }), /Workspace identity is required/);
});

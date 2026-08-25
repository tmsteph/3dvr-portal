import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BUILTIN_OPERATOR_ADMIN_BINDINGS,
  resolveOperatorDeveloperAccess,
  resolveOperatorDeveloperPolicy,
} from '../src/operator/developer-access.js';

const ASSISTANT_ALIAS = 'chatgpt-operator-e18d7ed6@3dvr';
const ASSISTANT_PUB = 'jcsaMMOmGSjWVJOtiPHI3hZWsudATRhOglXRdDatfSA.pzn7gtgVsDxfbV_md8B4a_W4eNTOavwnZwFU0qOtYcU';

test('assistant service account is bound to the exact SEA public key as an Operator admin', () => {
  const policy = resolveOperatorDeveloperPolicy({});
  assert.equal(BUILTIN_OPERATOR_ADMIN_BINDINGS[ASSISTANT_ALIAS], ASSISTANT_PUB);
  assert.equal(policy.adminBindings.get(ASSISTANT_ALIAS), ASSISTANT_PUB);
});

test('assistant service account receives admin and code-edit permissions', async () => {
  const access = await resolveOperatorDeveloperAccess({ authPub: ASSISTANT_PUB, authProof: 'proof-admin' }, {
    config: {},
    expectedOrigin: 'https://portal.3dvr.tech',
    verify: async () => ({
      ok: true,
      identity: { alias: ASSISTANT_ALIAS, pub: ASSISTANT_PUB },
    }),
  });

  assert.equal(access.authenticated, true);
  assert.equal(access.approved, true);
  assert.equal(access.role, 'admin');
  assert.deepEqual(access.permissions, ['suggest', 'edit', 'admin']);
});

test('assistant admin alias with a different SEA key is not privileged', async () => {
  const access = await resolveOperatorDeveloperAccess({ authPub: 'pub-evil', authProof: 'proof-evil' }, {
    config: {},
    verify: async () => ({
      ok: true,
      identity: { alias: ASSISTANT_ALIAS, pub: 'pub-evil' },
    }),
  });

  assert.equal(access.authenticated, true);
  assert.equal(access.approved, false);
  assert.equal(access.role, 'contributor');
  assert.deepEqual(access.permissions, ['suggest']);
});

test('public Operator E2E account is never a built-in admin', () => {
  assert.equal(
    BUILTIN_OPERATOR_ADMIN_BINDINGS['operator-e2e-20260823@3dvr@3dvr'],
    undefined
  );
});

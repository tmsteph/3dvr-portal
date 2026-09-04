import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BUILTIN_OPERATOR_OWNER_BINDINGS,
  BUILTIN_OPERATOR_OWNER_PUBS,
  BUILTIN_OPERATOR_DEVELOPER_BINDINGS,
  DEFAULT_OPERATOR_DEVELOPER_ALIAS,
  resolveOperatorDeveloperAccess,
  resolveOperatorDeveloperPolicy,
} from '../src/operator/developer-access.js';
import {
  buildOperatorRequest,
  buildPortalSnapshotInstruction,
  normalizeOperatorResult,
} from '../src/operator/api.js';

const TMSTEPH_PUB = 'Cg-NVNIbxWPDBqX7OmllJQqjxy2t3KA_U2DqQBjcPQ8.1fppECqamDOHh2tKt1G5t8Yd21NjBCZ3C6qunST3lvg';

test('default operator developer policy includes the trusted exact SEA binding', () => {
  const policy = resolveOperatorDeveloperPolicy({});
  assert.equal(DEFAULT_OPERATOR_DEVELOPER_ALIAS, '3dvr.tech@gmail.com');
  assert.equal(BUILTIN_OPERATOR_OWNER_BINDINGS['tmsteph@3dvr'], TMSTEPH_PUB);
  assert.deepEqual(BUILTIN_OPERATOR_OWNER_PUBS, [TMSTEPH_PUB]);
  assert.equal(BUILTIN_OPERATOR_DEVELOPER_BINDINGS['tmsteph@3dvr'], TMSTEPH_PUB);
  assert.equal(policy.pubs.size, 0);
  assert.equal(policy.ownerPubs.has(TMSTEPH_PUB), true);
  assert.equal(policy.ownerBindings.get('tmsteph@3dvr'), TMSTEPH_PUB);
  assert.equal(policy.bindings.get('tmsteph@3dvr'), TMSTEPH_PUB);
  assert.equal(policy.bindings.get('operator-e2e-20260823@3dvr@3dvr'), undefined);
});

test('built-in tmsteph SEA public key receives owner GitHub permission', async () => {
  const access = await resolveOperatorDeveloperAccess({ authPub: TMSTEPH_PUB, authProof: 'proof-1' }, {
    config: {},
    expectedOrigin: 'https://portal.3dvr.tech',
    verify: async () => ({
      ok: true,
      identity: { alias: 'tmsteph@3dvr', pub: TMSTEPH_PUB },
    }),
  });

  assert.equal(access.authenticated, true);
  assert.equal(access.approved, true);
  assert.equal(access.role, 'owner');
  assert.deepEqual(access.permissions, ['suggest', 'edit', 'github_write']);
});

test('trusted owner SEA key remains owner when the portal alias spelling changes', async () => {
  const access = await resolveOperatorDeveloperAccess({ authPub: TMSTEPH_PUB, authProof: 'proof-1' }, {
    config: {},
    expectedOrigin: 'https://portal.3dvr.tech',
    verify: async () => ({
      ok: true,
      identity: { alias: 'tmsteph', pub: TMSTEPH_PUB },
    }),
  });

  assert.equal(access.authenticated, true);
  assert.equal(access.approved, true);
  assert.equal(access.role, 'owner');
  assert.deepEqual(access.permissions, ['suggest', 'edit', 'github_write']);
});

test('owner-aware Operator prompt permits ordinary GitHub edits but keeps destructive actions protected', () => {
  const request = buildOperatorRequest({
    prompt: 'Fix the mobile nav and push it to GitHub.',
    developerAccess: {
      approved: true,
      role: 'owner',
      permissions: ['suggest', 'edit', 'github_write'],
    },
  });
  assert.match(request.instructions, /create a branch, commit, push, open a pull request, and merge/i);
  assert.match(request.instructions, /does not include deploy\/release, force-push/i);
});

test('approved SEA public key receives native local code edit permission', async () => {
  const access = await resolveOperatorDeveloperAccess({ authPub: 'pub-1', authProof: 'proof-1' }, {
    config: { THREEDVR_OPERATOR_DEVELOPER_PUBS: 'pub-1' },
    expectedOrigin: 'https://portal.3dvr.tech',
    verify: async () => ({
      ok: true,
      identity: { alias: '3dvr.tech@gmail.com', pub: 'pub-1' },
    }),
  });

  assert.equal(access.authenticated, true);
  assert.equal(access.approved, true);
  assert.equal(access.role, 'developer');
  assert.deepEqual(access.permissions, ['suggest', 'edit']);
});

test('claiming the maintainer alias with an unbound key remains a contributor', async () => {
  const access = await resolveOperatorDeveloperAccess({ authPub: 'pub-evil', authProof: 'proof-evil' }, {
    config: {
      THREEDVR_OPERATOR_DEVELOPER_BINDINGS: JSON.stringify({
        '3dvr.tech@gmail.com': 'pub-1',
      }),
    },
    verify: async () => ({
      ok: true,
      identity: { alias: '3dvr.tech@gmail.com', pub: 'pub-evil' },
    }),
  });

  assert.equal(access.authenticated, true);
  assert.equal(access.approved, false);
  assert.equal(access.role, 'contributor');
  assert.deepEqual(access.permissions, ['suggest']);
});

test('claiming tmsteph alias with a different SEA key remains a contributor', async () => {
  const access = await resolveOperatorDeveloperAccess({ authPub: 'pub-evil', authProof: 'proof-evil' }, {
    config: {},
    verify: async () => ({
      ok: true,
      identity: { alias: 'tmsteph@3dvr', pub: 'pub-evil' },
    }),
  });

  assert.equal(access.authenticated, true);
  assert.equal(access.approved, false);
  assert.equal(access.role, 'contributor');
  assert.deepEqual(access.permissions, ['suggest']);
});

test('exact alias-to-public-key binding can approve a 3DVR developer', async () => {
  const access = await resolveOperatorDeveloperAccess({ authPub: 'pub-1', authProof: 'proof-1' }, {
    config: {
      THREEDVR_OPERATOR_DEVELOPER_BINDINGS: JSON.stringify({
        '3dvr.tech@gmail.com': 'pub-1',
      }),
    },
    verify: async () => ({
      ok: true,
      identity: { alias: '3dvr.tech@gmail.com', pub: 'pub-1' },
    }),
  });

  assert.equal(access.authenticated, true);
  assert.equal(access.approved, true);
  assert.equal(access.role, 'developer');
});

test('signed but unapproved 3DVR account remains a contributor', async () => {
  const access = await resolveOperatorDeveloperAccess({ authPub: 'pub-2', authProof: 'proof-2' }, {
    config: { THREEDVR_OPERATOR_DEVELOPER_PUBS: 'pub-1' },
    verify: async () => ({
      ok: true,
      identity: { alias: 'builder@example.com', pub: 'pub-2' },
    }),
  });

  assert.equal(access.authenticated, true);
  assert.equal(access.approved, false);
  assert.equal(access.role, 'contributor');
  assert.deepEqual(access.permissions, ['suggest']);
});

test('developer proof is stripped from the model-visible portal snapshot', () => {
  const instruction = buildPortalSnapshotInstruction({
    developerAuth: {
      authPub: 'pub-secret',
      authProof: 'proof-secret',
    },
    apps: {
      crm: { available: true, count: 0 },
    },
  });

  assert.equal(instruction.includes('proof-secret'), false);
  assert.equal(instruction.includes('pub-secret'), false);
  assert.equal(instruction.includes('developerAuth'), false);
  assert.equal(instruction.includes('"crm"'), true);
});

test('operator normalizer accepts forge actions and constrains repo aliases', () => {
  const valid = normalizeOperatorResult({
    reply: 'I can make that edit.',
    suggestions: [],
    action: {
      type: 'request_code_change',
      title: 'Fix navbar',
      text: 'Tighten the mobile navbar spacing.',
      repo: 'agent',
      business: '',
      location: '',
      url: '',
    },
  });
  assert.equal(valid.action.type, 'request_code_change');
  assert.equal(valid.action.repo, 'agent');

  const invalidRepo = normalizeOperatorResult({
    action: {
      type: 'suggest_code_change',
      repo: '../outside',
    },
  });
  assert.equal(invalidRepo.action.repo, 'portal');
});

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_OPERATOR_DEVELOPER_ALIAS,
  resolveOperatorDeveloperAccess,
  resolveOperatorDeveloperPolicy,
} from '../src/operator/developer-access.js';
import {
  buildPortalSnapshotInstruction,
  normalizeOperatorResult,
} from '../src/operator/api.js';

test('default operator developer policy approves the 3DVR maintainer account', () => {
  const policy = resolveOperatorDeveloperPolicy({});
  assert.equal(DEFAULT_OPERATOR_DEVELOPER_ALIAS, '3dvr.tech@gmail.com');
  assert.equal(policy.aliases.has('3dvr.tech@gmail.com'), true);
});

test('approved 3DVR account receives native code edit permission', async () => {
  const access = await resolveOperatorDeveloperAccess({ authPub: 'pub-1', authProof: 'proof-1' }, {
    config: {},
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

test('signed but unapproved 3DVR account remains a contributor', async () => {
  const access = await resolveOperatorDeveloperAccess({ authPub: 'pub-2', authProof: 'proof-2' }, {
    config: {},
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

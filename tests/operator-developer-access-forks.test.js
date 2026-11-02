import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveOperatorDeveloperAccess,
  resolveOperatorDeveloperPolicy,
} from '../src/operator/developer-access.js';
import { createForkRecord, revokeFork } from '../src/agents/fork-contract.js';

const TMSTEPH_PUB = 'Cg-NVNIbxWPDBqX7OmllJQqjxy2t3KA_U2DqQBjcPQ8.1fppECqamDOHh2tKt1G5t8Yd21NjBCZ3C6qunST3lvg';
const CLAUDE_PUB = 'claude-pub';

const verifyAs = (alias, pub) => async () => ({ ok: true, identity: { alias, pub } });

function claudeFork(permissions, options = {}) {
  return createForkRecord({
    parentAlias: 'tmsteph@3dvr',
    parentPub: TMSTEPH_PUB,
    parentPermissions: [
      'suggest', 'edit', 'github_write', 'admin',
      'workspace.read', 'workspace.write', 'workspace.export',
      'workspace.manage_access', 'workspace.sync',
    ],
    childAlias: 'claude@3dvr',
    childPub: CLAUDE_PUB,
    permissions,
    note: 'Pilot agent fork',
  }, { now: 1000, idFactory: () => 'fork_claude', ...options });
}

test('policy carries no forks by default, so existing deployments are unchanged', () => {
  const policy = resolveOperatorDeveloperPolicy({});
  assert.deepEqual(policy.forks, []);
});

test('policy parses fork records from THREEDVR_FORKS config', () => {
  const policy = resolveOperatorDeveloperPolicy({
    THREEDVR_FORKS: JSON.stringify([claudeFork(['suggest'])]),
  });
  assert.equal(policy.forks.length, 1);
  assert.equal(policy.forks[0].childAlias, 'claude@3dvr');
});

test('an active pilot fork at suggest level resolves as a contributor via the fork', async () => {
  const access = await resolveOperatorDeveloperAccess(
    { authPub: CLAUDE_PUB, authProof: 'proof' },
    { config: {}, forks: [claudeFork(['suggest'])], verify: verifyAs('claude@3dvr', CLAUDE_PUB) }
  );
  assert.equal(access.authenticated, true);
  assert.equal(access.approved, false);
  assert.equal(access.role, 'contributor');
  assert.deepEqual(access.permissions, ['suggest']);
  assert.equal(access.viaFork, true);
});

test('a fork carrying edit resolves as a developer even without any binding', async () => {
  const access = await resolveOperatorDeveloperAccess(
    { authPub: CLAUDE_PUB, authProof: 'proof' },
    { config: {}, forks: [claudeFork(['suggest', 'edit'])], verify: verifyAs('claude@3dvr', CLAUDE_PUB) }
  );
  assert.equal(access.approved, true);
  assert.equal(access.role, 'developer');
  assert.deepEqual(access.permissions, ['suggest', 'edit']);
});

test('workspace capabilities on a fork do not leak into operator permissions', async () => {
  const access = await resolveOperatorDeveloperAccess(
    { authPub: CLAUDE_PUB, authProof: 'proof' },
    {
      config: {},
      forks: [claudeFork(['suggest', 'workspace.read', 'workspace.write'])],
      verify: verifyAs('claude@3dvr', CLAUDE_PUB),
    }
  );
  assert.deepEqual(access.permissions, ['suggest']);
});

test('a revoked fork resolves to no permissions at all', async () => {
  const revoked = revokeFork(claudeFork(['suggest', 'edit']), 2000);
  const access = await resolveOperatorDeveloperAccess(
    { authPub: CLAUDE_PUB, authProof: 'proof' },
    { config: {}, forks: [revoked], verify: verifyAs('claude@3dvr', CLAUDE_PUB) }
  );
  assert.equal(access.authenticated, true);
  assert.equal(access.approved, false);
  assert.deepEqual(access.permissions, []);
  assert.match(access.reason, /revoked/);
});

test('fork records loaded from config drive access resolution end to end', async () => {
  const access = await resolveOperatorDeveloperAccess(
    { authPub: CLAUDE_PUB, authProof: 'proof' },
    {
      config: { THREEDVR_FORKS: JSON.stringify([claudeFork(['suggest'])]) },
      verify: verifyAs('claude@3dvr', CLAUDE_PUB),
    }
  );
  assert.equal(access.viaFork, true);
  assert.deepEqual(access.permissions, ['suggest']);
});

test('identities without a fork record keep the existing binding behavior', async () => {
  const access = await resolveOperatorDeveloperAccess(
    { authPub: TMSTEPH_PUB, authProof: 'proof' },
    {
      config: { THREEDVR_FORKS: JSON.stringify([claudeFork(['suggest'])]) },
      verify: verifyAs('tmsteph@3dvr', TMSTEPH_PUB),
    }
  );
  assert.equal(access.role, 'owner');
  assert.deepEqual(access.permissions, ['suggest', 'edit', 'github_write']);
  assert.equal(access.viaFork, undefined);
});

test('a fork record for a different key does not capture the parent identity', async () => {
  // Same alias as the fork child is not enough: the pub must match too.
  const access = await resolveOperatorDeveloperAccess(
    { authPub: 'attacker-pub', authProof: 'proof' },
    { config: {}, forks: [claudeFork(['suggest', 'edit'])], verify: verifyAs('claude@3dvr', 'attacker-pub') }
  );
  assert.equal(access.viaFork, undefined);
  assert.equal(access.approved, false);
  assert.deepEqual(access.permissions, ['suggest']);
});

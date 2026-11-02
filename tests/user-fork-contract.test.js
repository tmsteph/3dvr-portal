import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FORK_FORMAT,
  FORK_VERSION,
  createForkRecord,
  findForksForIdentity,
  forkAllows,
  isForkActive,
  parseForkRecords,
  permissionsBeyondParent,
  resolveForkPermissions,
  revokeFork,
  validateForkRecord,
} from '../src/agents/fork-contract.js';

const PARENT = {
  parentAlias: 'tmsteph@3dvr',
  parentPub: 'parent-pub',
  parentPermissions: ['suggest', 'edit', 'github_write', 'admin', 'workspace.read', 'workspace.write'],
};

function buildFork(overrides = {}, options = {}) {
  return createForkRecord({
    ...PARENT,
    childAlias: 'claude@3dvr',
    childPub: 'claude-pub',
    permissions: ['suggest'],
    note: 'Pilot agent fork',
    ...overrides,
  }, { now: 1000, idFactory: () => 'fork_1', ...options });
}

test('createForkRecord builds a well-formed active fork record', () => {
  const fork = buildFork();
  assert.equal(fork.format, FORK_FORMAT);
  assert.equal(fork.version, FORK_VERSION);
  assert.equal(fork.forkId, 'fork_1');
  assert.equal(fork.parentAlias, 'tmsteph@3dvr');
  assert.equal(fork.childAlias, 'claude@3dvr');
  assert.deepEqual(fork.permissions, ['suggest']);
  assert.equal(fork.createdAt, 1000);
  assert.equal(fork.revokedAt, null);
  assert.equal(isForkActive(fork), true);
  assert.deepEqual(validateForkRecord(fork), fork);
});

test('createForkRecord accepts any subset of the parent permissions', () => {
  const fork = buildFork({ permissions: ['suggest', 'edit', 'workspace.read'] });
  assert.deepEqual(fork.permissions, ['suggest', 'edit', 'workspace.read']);
  const full = buildFork({ permissions: [...PARENT.parentPermissions] });
  assert.deepEqual(full.permissions, PARENT.parentPermissions);
});

test('createForkRecord rejects permissions beyond the parent (superset requests fail)', () => {
  assert.throws(
    () => buildFork({ permissions: ['suggest', 'workspace.manage_access'] }),
    /exceed the parent account's permissions: workspace\.manage_access/
  );
  assert.throws(
    () => createForkRecord({
      parentAlias: 'editor@3dvr',
      parentPub: 'editor-pub',
      parentPermissions: ['suggest'],
      childAlias: 'helper@3dvr',
      childPub: 'helper-pub',
      permissions: ['edit'],
    }),
    /exceed the parent account's permissions: edit/
  );
});

test('createForkRecord rejects unknown permission names', () => {
  assert.throws(
    () => buildFork({ permissions: ['suggest', 'teleport'] }),
    /unknown permissions: teleport/
  );
  assert.throws(
    () => buildFork({ parentPermissions: ['suggest', 'fly'] }),
    /unknown permissions: fly/
  );
});

test('createForkRecord requires distinct parent and child accounts', () => {
  assert.throws(
    () => buildFork({ childAlias: 'tmsteph@3dvr', childPub: 'other-pub' }),
    /distinct account/
  );
  assert.throws(
    () => buildFork({ childAlias: 'clone@3dvr', childPub: 'parent-pub' }),
    /distinct account/
  );
});

test('createForkRecord requires identities and at least one permission', () => {
  assert.throws(() => buildFork({ childPub: '' }), /Child public key is required/);
  assert.throws(() => buildFork({ parentAlias: ' ' }), /Parent alias is required/);
  assert.throws(() => buildFork({ permissions: [] }), /Fork permissions are required/);
});

test('permissionsBeyondParent reports exactly the extra permissions', () => {
  assert.deepEqual(permissionsBeyondParent(['suggest', 'edit'], ['suggest']), ['edit']);
  assert.deepEqual(permissionsBeyondParent(['suggest'], ['suggest', 'edit']), []);
});

test('revokeFork stamps revokedAt without mutating the original record', () => {
  const fork = buildFork();
  const revoked = revokeFork(fork, 2000);
  assert.equal(revoked.revokedAt, 2000);
  assert.equal(fork.revokedAt, null);
  assert.equal(isForkActive(revoked), false);
  assert.throws(() => revokeFork({}), /Fork ID is required/);
});

test('resolveForkPermissions unions active forks for the child identity only', () => {
  const a = buildFork({ permissions: ['suggest'] }, { idFactory: () => 'fork_a' });
  const b = buildFork({ permissions: ['workspace.read', 'workspace.write'] }, { idFactory: () => 'fork_b' });
  const other = buildFork(
    { childAlias: 'chatgpt@3dvr', childPub: 'chatgpt-pub', permissions: ['edit'] },
    { idFactory: () => 'fork_c' }
  );
  const forks = [a, b, other];
  assert.deepEqual(
    resolveForkPermissions(forks, { alias: 'claude@3dvr', pub: 'claude-pub' }).sort(),
    ['suggest', 'workspace.read', 'workspace.write']
  );
  assert.deepEqual(resolveForkPermissions(forks, { alias: 'nobody@3dvr', pub: 'nope' }), []);
  // A matching pub with the wrong alias does not resolve.
  assert.deepEqual(resolveForkPermissions(forks, { alias: 'chatgpt@3dvr', pub: 'claude-pub' }), []);
  assert.equal(forkAllows(forks, { alias: 'claude@3dvr', pub: 'claude-pub' }, 'workspace.write'), true);
  assert.equal(forkAllows(forks, { alias: 'claude@3dvr', pub: 'claude-pub' }, 'edit'), false);
});

test('revoked forks grant nothing after revocation', () => {
  const fork = revokeFork(buildFork({ permissions: ['suggest', 'edit'] }), 3000);
  assert.deepEqual(resolveForkPermissions([fork], { alias: 'claude@3dvr', pub: 'claude-pub' }), []);
  assert.equal(forkAllows([fork], { alias: 'claude@3dvr', pub: 'claude-pub' }, 'suggest'), false);
  assert.equal(findForksForIdentity([fork], { alias: 'claude@3dvr', pub: 'claude-pub' }).length, 1);
});

test('parseForkRecords loads stored JSON and skips malformed entries', () => {
  const fork = buildFork();
  const parsed = parseForkRecords(JSON.stringify([fork, { bogus: true }, null]));
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].forkId, 'fork_1');
  assert.deepEqual(parseForkRecords('not json'), []);
  assert.deepEqual(parseForkRecords(undefined), []);
  assert.deepEqual(parseForkRecords(JSON.stringify({ forks: [fork] })).length, 1);
});

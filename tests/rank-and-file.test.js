import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildInvite,
  buildJoinUrl,
  mergeRefs,
  parseInvite,
  refKey,
  removeRef
} from '../rank-and-file/model.js';

const committeeA = { kind: 'committee', id: 'committee_abcdefghijkl', secret: 'secret_abcdefghijklmnopqrstuvwxyz0123456789' };
const committeeB = { kind: 'committee', id: 'committee_bbcdefghijkl', secret: 'secret_bbcdefghijklmnopqrstuvwxyz0123456789' };
const coalitionA = { kind: 'coalition', id: 'coalition_abcdefghijkl', secret: 'secret_coalition_abcdefghijklmnopqrstuvwxyz012345' };

test('rank-and-file invites round trip without exposing the secret in a query string', () => {
  const invite = buildInvite(committeeA);
  assert.match(invite, /^rf1\./);
  assert.deepEqual(parseInvite(invite, 'committee'), committeeA);

  const url = buildJoinUrl(committeeA, 'https://portal.3dvr.tech/rank-and-file/?tracking=nope');
  assert.equal(new URL(url).search, '');
  assert.match(new URL(url).hash, /^#join=/);
  assert.deepEqual(parseInvite(url, 'committee'), committeeA);
});

test('people can retain multiple committee and coalition capabilities at once', () => {
  let refs = mergeRefs([], committeeA);
  refs = mergeRefs(refs, committeeB);
  refs = mergeRefs(refs, coalitionA);
  assert.equal(refs.length, 3);
  assert.equal(new Set(refs.map(refKey)).size, 3);

  refs = mergeRefs(refs, { ...committeeA });
  assert.equal(refs.length, 3, 're-joining the same committee should not duplicate the local capability');

  refs = removeRef(refs, committeeA);
  assert.equal(refs.length, 2);
  assert.ok(refs.some(ref => ref.kind === 'committee'));
  assert.ok(refs.some(ref => ref.kind === 'coalition'));
});

test('committee and coalition invite types cannot be confused', () => {
  assert.throws(() => parseInvite(buildInvite(coalitionA), 'committee'), /coalition invite/);
  assert.throws(() => parseInvite('not-an-invite'), /does not look like/);
});

test('rank-and-file page describes the boundaryless federated model and privacy posture', async () => {
  const [html, app] = await Promise.all([
    readFile(new URL('../rank-and-file/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../rank-and-file/app.js', import.meta.url), 'utf8')
  ]);

  assert.match(html, /A person can belong to many committees/i);
  assert.match(html, /Committees can join many coalitions/i);
  assert.match(html, /cross employers, unions, trades, shifts, cities, and causes/i);
  assert.match(html, /encrypted before being written to GUN/i);
  assert.match(app, /SEA\.encrypt/);
  assert.match(app, /coalition\.linked/);
  assert.match(app, /committee\.linked/);
  assert.match(app, /rank-and-file-v1/);
});

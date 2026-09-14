import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { pickNewestPurposeState } from '../purpose/account-sync.js';

test('Purpose page wires Gun, SEA, identity, and the account-sync bootstrap', async () => {
  const html = await readFile(new URL('../purpose/index.html', import.meta.url), 'utf8');
  assert.match(html, /gun\/gun\.js/);
  assert.match(html, /gun\/sea\.js/);
  assert.match(html, /auth-identity\.js/);
  assert.match(html, /purpose\/account-sync\.js/);
  assert.match(html, /encrypted to your account/i);
});

test('Purpose account bridge chooses the newest state before the app initializes', () => {
  const local = {
    answers: ['', 'local focus', '', '', ''],
    updatedAt: '2026-09-14T19:00:00Z'
  };
  const remote = {
    answers: ['', 'new remote focus', '', '', ''],
    updatedAt: '2026-09-14T20:00:00Z'
  };
  assert.equal(pickNewestPurposeState(local, remote).answers[1], 'new remote focus');
  assert.equal(pickNewestPurposeState(remote, local).answers[1], 'new remote focus');
});

test('Purpose sync stores private data only through encrypted account nodes', async () => {
  const source = await readFile(new URL('../purpose/account-sync.js', import.meta.url), 'utf8');
  assert.match(source, /SEA\.encrypt/);
  assert.match(source, /createAlignmentProfileSync/);
  assert.doesNotMatch(source, /gun\.get\(['"]purpose['"]\)/);
  assert.match(source, /user\.get\(['"]purpose['"]\)/);
});

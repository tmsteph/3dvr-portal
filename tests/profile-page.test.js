import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('profile page exposes OAuth provider management and OAuth-only session handling', async () => {
  const html = await readFile(new URL('../profile.html', import.meta.url), 'utf8');

  assert.match(html, /id="profile-oauth"/);
  assert.match(html, /id="oauth-status-google"/);
  assert.match(html, /id="oauth-link-google"/);
  assert.match(html, /id="oauth-status-microsoft"/);
  assert.match(html, /id="oauth-link-microsoft"/);
  assert.match(html, /id="oauth-status-apple"/);
  assert.match(html, /function refreshOauthProfile\(\)/);
  assert.match(html, /function consumePendingProfileOauthResult\(\)/);
  assert.match(html, /function hasOauthOnlySession\(\)/);
  assert.match(html, /initializeSignedInProfile\(\{ oauthOnly: true \}\)/);
});

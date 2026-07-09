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

test('profile section exposes a sign-out action that clears stored auth state', async () => {
  const html = await readFile(new URL('../profile.html', import.meta.url), 'utf8');

  assert.match(html, /id="profile-sign-out"/);
  assert.match(html, /onclick="handleProfileSignOut\(\)"/);
  assert.match(html, /function handleProfileSignOut\(\)/);
  assert.match(html, /user\.leave\(\)/);
  assert.match(html, /PortalOAuth\.clearAuthSessionMarkers/);
  assert.match(html, /function clearLocalAuthState\(\)/);
  assert.match(html, /function isGunAuthInProgressError\(message = ''\)/);
  assert.match(html, /function restoreSignedInGunSession\(alias, password, attempt = 0\)/);
  assert.match(html, /attempt < 8/);
  assert.match(html, /restoreSignedInGunSession\(signedInAlias, signedInPassword\)\.then\(restored =>/);
  assert.match(html, /clearLocalAuthState\(\);/);
  assert.match(html, /'signedIn'/);
  assert.match(html, /'authMethod'/);
  assert.match(html, /'verifiedEmail'/);
  assert.match(html, /window\.location\.href = 'index\.html'/);
});

test('profile page exposes clear sign-in paths for guest users', async () => {
  const html = await readFile(new URL('../profile.html', import.meta.url), 'utf8');

  assert.match(html, /href="sign-in\.html\?redirect=%2Fprofile\.html" data-profile-auth-entry>🔑 Sign in<\/a>/);
  assert.match(html, /id="profile-sign-in-callout"/);
  assert.match(html, /You are using this browser as a guest/);
  assert.match(html, /Sign in or create account/);
  assert.match(html, /const profileSignInCallout = document\.getElementById\('profile-sign-in-callout'\)/);
  assert.match(html, /const profileAuthEntryLinks = Array\.from\(document\.querySelectorAll\('\[data-profile-auth-entry\]'\)\)/);
  assert.match(html, /function updateProfileSignInCallout\(\)/);
  assert.match(html, /profileSignInCallout\.hidden = isSignedIn/);
  assert.match(html, /link\.textContent = isSignedIn \? '👤 Profile' : '🔑 Sign in'/);
  assert.doesNotMatch(html, /sign-in\.html\?upgrade=guest/);
});

test('profile page recovers signed-in display names from shared identity and alias fallbacks', async () => {
  const html = await readFile(new URL('../profile.html', import.meta.url), 'utf8');

  assert.match(html, /<script src="auth-identity\.js"><\/script>/);
  assert.match(html, /AuthIdentity\.syncStorageFromSharedIdentity\(localStorage\)/);
  assert.match(html, /const storedAliasName = aliasToDisplay\(readStoredAlias\(\)\)/);
  assert.match(html, /return storedAliasName \|\| 'User'/);
  assert.match(html, /portalStoredName \|\| aliasName \|\| aliasToDisplay\(readStoredAlias\(\)\) \|\| 'User'/);
  assert.doesNotMatch(html, /portalStoredName \|\| aliasName \|\| 'Guest'/);
});

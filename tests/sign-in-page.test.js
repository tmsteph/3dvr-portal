import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';

const signInUrl = new URL('../sign-in.html', import.meta.url);

async function fileExists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch (error) {
    return false;
  }
}

describe('sign-in page', () => {
  it('preserves safe redirect targets after account creation', async () => {
    assert.equal(await fileExists(signInUrl), true, 'sign-in.html should exist');

    const html = await readFile(signInUrl, 'utf8');
    assert.match(html, /sanitizeRedirectDestination/);
    assert.match(html, /const postSignInDestination = resolvePostSignInDestination\(\);/);
    assert.match(html, /window\.location\.href = postSignInDestination;/);
  });

  it('adds billing-specific sign-in guidance when users arrive from the billing center', async () => {
    const html = await readFile(signInUrl, 'utf8');
    assert.match(html, /id="redirect-context"/);
    assert.match(html, /Create your portal account to continue/);
    assert.match(html, /Continue to billing/);
    assert.match(html, /Billing needs an account so Stripe stays linked to one portal identity/);
    assert.match(html, /embedded:\s*'\$200 Embedded Plan'/);
  });

  it('persists the current portal pub when billing sign-in completes', async () => {
    const html = await readFile(signInUrl, 'utf8');
    assert.match(html, /localStorage\.setItem\('userPubKey', userPub\)/);
  });

  it('links directly to the canonical password reset route', async () => {
    const html = await readFile(signInUrl, 'utf8');
    assert.match(html, /href="\/password-reset\.html"/);
    assert.doesNotMatch(html, /href="\/auth\/recovery\.html"/);
  });

  it('offers OAuth sign-in buttons and runtime wiring for Google, Microsoft, and Apple', async () => {
    const html = await readFile(signInUrl, 'utf8');
    assert.match(html, /<script src="oauth\.js"><\/script>/);
    assert.match(html, /id="oauth-google"/);
    assert.match(html, /id="oauth-microsoft"/);
    assert.match(html, /id="oauth-apple"/);
    assert.match(html, /function finishOAuthLogin\(result = \{\}\)/);
    assert.match(html, /PortalOAuth\.writeAuthSession/);
    assert.match(html, /PortalOAuth\.storeConnectionFromResult/);
    assert.match(html, /PortalOAuth\.begin\(provider,/);
    assert.ok(
      html.indexOf('id="auth-submit"') < html.indexOf('class="oauth-panel"'),
      'password submit should appear before the OAuth panel'
    );
  });

  it('keeps recovery email optional while offering verification', async () => {
    const html = await readFile(signInUrl, 'utf8');
    assert.match(html, /<label for="recovery-email">Recovery email \(optional\)<\/label>/);
    assert.doesNotMatch(html, /id="recovery-email"[\s\S]*required/);
    assert.match(html, /id="send-recovery-code"/);
    assert.match(html, /id="recovery-code"/);
    assert.match(html, /id="verify-recovery-code"/);
    assert.match(html, /mode:\s*'recovery-verification'/);
    assert.match(html, /mode:\s*'confirm-recovery-email'/);
    assert.match(html, /const verifiedRecoveryEmail = recoveryEmail && isRecoveryEmailVerified\(recoveryEmail\)/);
    assert.match(html, /Continuing without account recovery/);
    assert.match(html, /recoveryEmailVerifiedAt/);
  });

  it('explains guest account upgrades and keeps guest progress', async () => {
    const html = await readFile(signInUrl, 'utf8');
    assert.match(html, /function isGuestUpgradeContext\(\)/);
    assert.match(html, /params\.get\('upgrade'\) === 'guest'/);
    assert.match(html, /Save your guest progress/);
    assert.match(html, /Create account and keep progress/);
    assert.match(html, /migrateGuestProgress\(\{ isNewAccount, alias, userPubKey: userPub \}\)/);
    assert.match(html, /function migrateGuestNotes\(guestProfile\)/);
    assert.match(html, /guestProfile\.get\('notes'\)/);
    assert.match(html, /user\.get\('notes'\)/);
    assert.match(html, /Stay in guest mode/);
  });

  it('runs the guest data fast path only for newly created accounts', async () => {
    const html = await readFile(signInUrl, 'utf8');
    assert.match(html, /finishLogin\(username, alias, password, verifiedRecoveryEmail, \{ isNewAccount: true \}\)/);
    assert.match(html, /finishLogin\(username, alias, password, verifiedRecoveryEmail, \{ isNewAccount: false \}\)/);
    assert.match(html, /function migrateNewGuestAccountData\(guestProfile, \{ guestId, alias \}\)/);
    assert.match(html, /guestProfile\.get\('contacts'\)/);
    assert.match(html, /user\.get\('contacts'\)/);
    assert.match(html, /pocketWorkstation'\)\.get\('users'\)/);
    assert.match(html, /guestAccountMigrations/);
    assert.match(html, /guestIdentityLinks/);
  });
});

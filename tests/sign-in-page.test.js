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
  });
});

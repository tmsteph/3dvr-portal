import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const navbarUrl = new URL('../navbar.js', import.meta.url);
const indexUrl = new URL('../index.html', import.meta.url);

describe('guest account entrypoints', () => {
  it('turns the floating guest identity action into a normal sign-in link', async () => {
    const source = await readFile(navbarUrl, 'utf8');
    assert.doesNotMatch(source, /function guestUpgradeHref\(\)/);
    assert.doesNotMatch(source, /upgrade=guest/);
    assert.doesNotMatch(source, /Create an account and keep guest progress/);
    assert.match(source, /function currentSignInHref\(\)/);
    assert.match(source, /window\.location\.href = currentSignInHref\(\)/);
    assert.match(source, /button\.innerText = 'Sign in'/);
    assert.match(source, /button\.setAttribute\('aria-label', 'Sign in or create an account'\)/);
    assert.doesNotMatch(source, /button\.setAttribute\('aria-label', 'Sign out of guest mode'\)/);
  });

  it('sends the homepage auth modal to normal sign-in without the guest upgrade flag', async () => {
    const html = await readFile(indexUrl, 'utf8');
    assert.match(html, /onclick="startAccountFromHere\(\)"/);
    assert.match(html, /function startAccountFromHere\(\)/);
    assert.match(html, /localStorage\.setItem\('guest', 'true'\)/);
    assert.match(html, /authModal\.style\.display = 'none'/);
    assert.doesNotMatch(html, /authModal\.style\.display = 'flex'/);
    assert.doesNotMatch(html, /upgradeParam/);
    assert.doesNotMatch(html, /sign-in\.html\?upgrade=guest/);
    assert.doesNotMatch(html, /&upgrade=guest/);
    assert.match(html, /\/sign-in\.html\?redirect=/);
  });
});

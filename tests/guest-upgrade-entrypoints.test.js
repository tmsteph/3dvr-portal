import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const navbarUrl = new URL('../navbar.js', import.meta.url);
const indexUrl = new URL('../index.html', import.meta.url);

describe('guest account entrypoints', () => {
  it('keeps the floating guest identity action as sign out instead of account creation', async () => {
    const source = await readFile(navbarUrl, 'utf8');
    assert.doesNotMatch(source, /function guestUpgradeHref\(\)/);
    assert.doesNotMatch(source, /upgrade=guest/);
    assert.doesNotMatch(source, /Create an account and keep guest progress/);
    assert.match(source, /button\.innerText = 'Sign Out'/);
    assert.match(source, /button\.setAttribute\('aria-label', 'Sign out of guest mode'\)/);
  });

  it('sends the homepage auth modal to normal sign-in without the guest upgrade flag', async () => {
    const html = await readFile(indexUrl, 'utf8');
    assert.match(html, /onclick="startAccountFromHere\(\)"/);
    assert.match(html, /function startAccountFromHere\(\)/);
    assert.doesNotMatch(html, /upgradeParam/);
    assert.doesNotMatch(html, /&upgrade=guest/);
    assert.match(html, /\/sign-in\.html\?redirect=/);
  });
});

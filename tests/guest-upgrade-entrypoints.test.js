import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const navbarUrl = new URL('../navbar.js', import.meta.url);
const indexUrl = new URL('../index.html', import.meta.url);

describe('guest upgrade entrypoints', () => {
  it('turns the floating guest identity action into account creation', async () => {
    const source = await readFile(navbarUrl, 'utf8');
    assert.match(source, /function guestUpgradeHref\(\)/);
    assert.match(source, /upgrade=guest/);
    assert.match(source, /Create account/);
    assert.match(source, /Create an account and keep guest progress/);
    assert.match(source, /if \(isGuest\) \{\s*window\.location\.href = guestUpgradeHref\(\);/);
  });

  it('sends the homepage auth modal through the upgrade-aware sign-in link', async () => {
    const html = await readFile(indexUrl, 'utf8');
    assert.match(html, /onclick="startAccountFromHere\(\)"/);
    assert.match(html, /function startAccountFromHere\(\)/);
    assert.match(html, /upgradeParam = localStorage\.getItem\('guest'\) === 'true' \? '&upgrade=guest' : ''/);
    assert.match(html, /\/sign-in\.html\?redirect=/);
  });
});

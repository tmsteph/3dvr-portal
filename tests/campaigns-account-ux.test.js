import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Campaigns header follows portal account state', async () => {
  const [html, account, styles] = await Promise.all([
    read('campaigns/index.html'),
    read('campaigns/account.js'),
    read('campaigns/styles.css')
  ]);

  assert.match(html, /data-account-entry href="\/sign-in\.html\?redirect=%2Fcampaigns%2F">Sign in<\/a>/);
  assert.match(html, /<script src="\/auth-identity\.js"><\/script>/);
  assert.match(html, /<script src="\.\/account\.js"><\/script>/);
  assert.match(account, /syncStorageFromSharedIdentity\?\.\(localStorage\)/);
  assert.match(account, /accountEntry\.href = '\/sign-in\.html\?redirect=%2Fcampaigns%2F'/);
  assert.match(account, /accountEntry\.href = '\/profile\.html#profile'/);
  assert.match(account, /3dvr:score:user:/);
  assert.match(account, /accountEntry\.textContent = `\$\{state\.displayName\} · ⭐ \$\{points\}`/);
  assert.doesNotMatch(html, /Sign out/i);
  assert.doesNotMatch(account, /user\.leave|Sign out/i);
  assert.match(styles, /\.account-link/);
  assert.match(styles, /\.topbar-links \{ order: 3; width: 100%; \}/);
});

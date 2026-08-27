import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('homepage account entry follows portal auth state', async () => {
  const [html, app] = await Promise.all([
    read('index.html'),
    read('home-operator.js')
  ]);

  assert.match(html, /<script src="\/auth-identity\.js" defer><\/script>/);
  assert.match(html, /data-auth-entry>Sign in<\/a>/);
  assert.match(app, /syncStorageFromSharedIdentity\?\.\(localStorage\)/);
  assert.match(app, /authEntry\.href = '\/profile\.html#profile'/);
  assert.match(app, /3dvr:score:user:/);
  assert.match(app, /:pending/);
  assert.match(app, /:portalPending/);
  assert.match(app, /authEntry\.textContent = `\$\{state\.displayName\} · ⭐ \$\{points\}`/);
  assert.match(app, /authEntry\.href = '\/sign-in\.html\?redirect=%2F'/);
  assert.match(app, /authEntry\.textContent = 'Sign in'/);
  assert.doesNotMatch(app, /signInLink\.hidden/);
});

test('homepage keeps the first screen concise and action-oriented', async () => {
  const html = await read('index.html');

  assert.match(html, /Tap for shortcuts/);
  assert.match(html, /What do you want to do\?/);
  assert.match(html, /Ask Operator, or choose a starting point\./);
  assert.match(html, /Turn what matters into one clear next step\./);
  assert.match(html, /Use a skill to find work and reach out\./);
  assert.match(html, /Turn an idea into something real\./);
  assert.match(html, /Apps, calendar, CRM, projects, and more\./);
  assert.doesNotMatch(html, /Operator sees this page plus available/);
  assert.doesNotMatch(html, /<p class="eyebrow">3DVR Portal<\/p>/);
});

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
  assert.match(html, /gun\/gun\.js/);
  assert.match(html, /gun\/sea\.js/);
  assert.match(html, /<script src="\/score\.js"><\/script>/);
  assert.match(html, /data-auth-entry>Sign in<\/a>/);
  assert.match(app, /syncStorageFromSharedIdentity\?\.\(localStorage\)/);
  assert.match(app, /authEntry\.href = '\/profile\.html#profile'/);
  assert.match(app, /3dvr:score:user:/);
  assert.match(app, /:pending/);
  assert.match(app, /:portalPending/);
  assert.match(app, /authEntry\.textContent = `\$\{state\.displayName\} · ⭐ \$\{points\}`/);
  assert.match(app, /ScoreSystem\.getManager/);
  assert.match(app, /ScoreSystem\.recallUserSession/);
  assert.match(app, /portalRoot\.get\('userStats'\)\.get\(state\.alias\)/);
  assert.match(app, /portalRoot\.get\('userStatsByPub'\)\.get\(pub\)/);
  assert.match(app, /scoreManager\.subscribe/);
  assert.match(app, /scoreManager\.whenReady/);
  assert.match(app, /authEntry\.href = '\/sign-in\.html\?redirect=%2F'/);
  assert.match(app, /authEntry\.textContent = 'Sign in'/);
  assert.match(app, /installOsLauncher/);
  assert.doesNotMatch(app, /signInLink\.hidden/);
});

test('homepage keeps the first screen concise and the spinner stays a toy', async () => {
  const html = await read('index.html');

  assert.match(html, /What do you want to do\?/);
  assert.doesNotMatch(html, /Hold to open quick navigation/);
  assert.doesNotMatch(html, /Tap for shortcuts/);
  assert.doesNotMatch(html, /data-spinner-nav-toggle/);
  assert.doesNotMatch(html, /data-spinner-nav/);
  assert.doesNotMatch(html, /spinner-nav__item/);
  assert.doesNotMatch(html, /const spinnerHoldDelay/);
  // The old spinner menu destinations stay one tap away without it.
  assert.match(html, /href="\/games\.html">Games<\/a>/);
  assert.match(html, /app-link" href="\/lead-finder\/"/);
  assert.doesNotMatch(html, /duration <= 340/);
  assert.doesNotMatch(html, /Operator sees this page plus available/);
  assert.doesNotMatch(html, /<p class="eyebrow">3DVR Portal<\/p>/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const page = await readFile(new URL('../os/index.html', import.meta.url), 'utf8');

test('OS launcher carries Thomas\u2019s framing: a portal into our world', () => {
  assert.match(page, /<title>3DVR OS \u2014 A portal into our world<\/title>/);
  assert.match(page, /A portal into our world/);
});

test('OS launcher is only apps and navigation: every tile is a real app surface', () => {
  const expectedHrefs = [
    'https://operator.3dvr.tech/',
    'https://helm.3dvr.tech/',
    'https://portal.3dvr.tech/',
    'https://portal.3dvr.tech/calendar/',
    'https://portal.3dvr.tech/contacts/',
    'https://portal.3dvr.tech/3dvr-world/',
    'https://portal.3dvr.tech/encore/',
    'https://portal.3dvr.tech/system/desk/',
    'https://portal.3dvr.tech/3dvr-girl/',
  ];
  for (const href of expectedHrefs) {
    assert.match(page, new RegExp(`href="${href.replaceAll('/', '\\/')}"`), `missing tile for ${href}`);
  }
  // Nine tiles, no more: nothing fake and nothing competing with the tiles.
  assert.equal((page.match(/class="tile"/g) || []).length, 9);
});

test('OS launcher uses each app\u2019s own icon, large', () => {
  for (const icon of [
    '/icons/operator-512.png',
    '/icons/helm-512.png',
    '/icons/icon-512.png',
    '/calendar/icons/icon-512.png',
    '/contacts/icons/icon-512.png',
    '/icons/3dvr-girl-512.png',
  ]) {
    assert.match(page, new RegExp(`src="${icon.replaceAll('/', '\\/')}"`), `missing icon ${icon}`);
  }
});

test('OS launcher has no external dependencies and works signed out', () => {
  assert.doesNotMatch(page, /<script[^>]+src=/i);
  assert.doesNotMatch(page, /<link[^>]+rel="stylesheet"/i);
  assert.doesNotMatch(page, /fonts\.googleapis\.com/i);
  assert.match(page, /<link rel="manifest" href="\/manifest\.webmanifest">/);
});

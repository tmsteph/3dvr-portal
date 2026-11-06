import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('homepage spinner is a play-only toy, not navigation', async () => {
  const homepage = await read('index.html');

  assert.match(homepage, /<script src="\/portal-swirl-logo\.js" defer><\/script>/);
  assert.match(homepage, /data-portal-swirl-logo/);
  assert.match(homepage, /role="img"/);
  assert.match(homepage, /aria-label="3DVR portal spinner"/);
  assert.doesNotMatch(homepage, /data-spinner-nav-toggle/);
  assert.doesNotMatch(homepage, /data-spinner-nav/);
  assert.doesNotMatch(homepage, /spinner-nav__item/);
  assert.doesNotMatch(homepage, /spinner-direction\.js/);
  assert.doesNotMatch(homepage, /Hold to open quick navigation/);
  assert.doesNotMatch(homepage, /aria-expanded/);
  // Every destination the radial spinner menu offered is still linked
  // from the homepage itself (apps list and top navigation).
  assert.match(homepage, /app-link" href="\/life\/"/);
  assert.match(homepage, /app-link" href="\/growth-desk\/"/);
  assert.match(homepage, /app-link" href="\/forge\/"/);
  assert.match(homepage, /app-link" href="\/lead-finder\/"/);
  assert.match(homepage, /href="\/games\.html">Games<\/a>/);
});

test('portal spinner avoids the baked-in glare hotspot', async () => {
  const logo = await read('portal-swirl-logo.js');

  assert.doesNotMatch(logo, /const gloss = context\.createLinearGradient/);
  assert.doesNotMatch(logo, /new THREE\.PointLight\(/);
});

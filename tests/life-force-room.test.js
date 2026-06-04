import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Life Force Room ships a symbolic experimental prototype', async () => {
  const html = await readFile(new URL('../life-force-room/index.html', import.meta.url), 'utf8');
  const portal = await readFile(new URL('../index.html', import.meta.url), 'utf8');

  assert.match(html, /Life Force Room \| 3DVR Portal/);
  assert.match(html, /eros as life-force/);
  assert.match(html, /We are not building a fantasy of uncontrolled sexuality/);
  assert.match(html, /temple for life-force/);
  assert.match(html, /Desire is not shameful/);
  assert.match(html, /Consent makes desire safe/);
  assert.match(html, /The body is the doorway/);
  assert.match(html, /Sexual energy can become creativity/);
  assert.match(html, /Real intimacy requires honesty and care/);
  assert.match(html, /data-life-force-canvas/);
  assert.match(html, /cdnjs\.cloudflare\.com\/ajax\/libs\/three\.js\/r128\/three\.min\.js/);
  assert.match(html, /new THREE\.WebGLRenderer/);
  assert.match(html, /THREE\.PlaneGeometry/);
  assert.match(html, /THREE\.Points/);
  assert.match(html, /fallback-orb/);
  assert.match(html, /Your reflections stay on this device/);
  assert.match(html, /life-force-room\.reflections\.v1/);
  assert.match(html, /localStorage\.setItem/);
  assert.match(html, /Ground/);
  assert.match(html, /Embody/);
  assert.match(html, /Desire/);
  assert.match(html, /Transmute/);
  assert.match(html, /Connect/);
  assert.match(html, /Create: write, code, draw, make music/);
  assert.match(html, /Move: stretch, dance, walk, train/);
  assert.match(html, /send a respectful message/);
  assert.match(html, /private self-care without shame/);
  assert.match(html, /consent, privacy, and care/);
  assert.doesNotMatch(html, /nudity|explicit sexual imagery|public-sex|public indecency/i);

  assert.match(portal, /href="life-force-room\/"/);
  assert.match(portal, /<span class="app-card__title">Life Force Room<\/span>/);
  assert.match(portal, /data-app-tier="experimental"/);
  assert.match(portal, /Explore desire, embodiment, consent, and creative transmutation/);
});

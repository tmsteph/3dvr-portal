import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('3DVR Connect ships as the public consent platform route and portal card', async () => {
  const html = await readFile(new URL('../3dvr-connect/index.html', import.meta.url), 'utf8');
  const portal = await readFile(new URL('../index.html', import.meta.url), 'utf8');

  assert.match(html, /<title>3DVR Connect \| Open Form<\/title>/);
  assert.match(html, /3DVR Connect is the consent-based community and play-space platform around Open Form\./);
  assert.match(html, /Open Form is a sensual menswear and intimacy-wear label around it\./);
  assert.match(html, /<h2 class="section-title">3DVR Connect<\/h2>/);
  assert.match(html, /Placeholder: event listings module and attendance workflows should be built here\./);
  assert.match(html, /Placeholder: membership billing and entitlement wiring should be inserted in Connect flows\./);
  assert.match(html, /Placeholder: consent onboarding flow and boundary management should mount adjacent to this component\./);
  assert.match(html, /<p class="brand">3DVR Connect<\/p>/);
  assert.match(portal, /<span class="app-card__badge">Experimental<\/span>/);
  assert.match(portal, /<span class="app-card__title">3DVR Connect<\/span>/);
  assert.doesNotMatch(portal, /href="experimental\/"/);
});

test('Fascia Release ships as a standalone gentle reset and portal card', async () => {
  const html = await readFile(new URL('../fascia-release/index.html', import.meta.url), 'utf8');
  const portal = await readFile(new URL('../index.html', import.meta.url), 'utf8');

  assert.match(html, /<title>Fascia Release \| 3DVR Portal<\/title>/);
  assert.match(html, /presented as a single-screen interactive experience/);
  assert.match(html, /overflow: hidden;/);
  assert.match(html, /data-view-panel="routine"/);
  assert.match(html, /data-view-panel="desk"/);
  assert.match(html, /data-step="0"/);
  assert.match(html, /Start reset/);
  assert.match(html, /Tongue soft, jaw heavy, eyes soft/);
  assert.match(html, /Seek care urgently if/);
  assert.match(html, /The computer jaw rule/);
  assert.match(html, /NHS inform/);
  assert.match(html, /Mayo Clinic/);
  assert.match(html, /Cleveland Clinic/);
  assert.match(html, /<p class="brand">Fascia Release<\/p>/);
  assert.doesNotMatch(html, /Placeholder image panel/);
  assert.match(portal, /<span class="app-card__title">Fascia Release<\/span>/);
  assert.match(portal, /data-app-tier="experimental"/);
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('manifest page wraps the existing manifestation apps into one grounded builder path', async () => {
  const html = await readFile(new URL('../manifest/index.html', import.meta.url), 'utf8');
  const css = await readFile(new URL('../manifest/styles.css', import.meta.url), 'utf8');
  const app = await readFile(new URL('../manifest/app.js', import.meta.url), 'utf8');
  const portal = await readFile(new URL('../index.html', import.meta.url), 'utf8');

  assert.match(html, /Manifestation for Builders/);
  assert.match(html, /Calm your body\. Clarify your desire\. Train your attention\. Take one real action\./);
  assert.match(html, /attention \+ body state \+ vision \+ evidence \+ one real-world action/);
  assert.match(html, /Manifest one real thing today/);
  assert.match(html, /Explore mystery without losing your grounding/);
  assert.match(html, /No magical control claims/);

  for (const route of [
    '../meditation/',
    '../meditation/affirmations.html#manifestationHeading',
    '../inner-alignment/',
    '../life/index.html',
    '../master-key-room/',
    '../intention-lab/',
    '../portal-lab/',
    '../science/',
    '../field-simulation/index.html',
    '../alive-system/',
    '../launch-room/'
  ]) {
    assert.match(html, new RegExp(`href="${route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
  }

  for (const id of ['manifestWant', 'manifestWhy', 'manifestBlock', 'manifestAction', 'manifestEvidence']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }

  assert.match(css, /\.manifest-step-grid/);
  assert.match(css, /\.manifest-card/);
  assert.match(app, /3dvr\.manifest\.dailyCard\.v1/);
  assert.match(app, /navigator\.clipboard\.writeText\(formatCard\(card\)\)/);
  assert.match(app, /window\.localStorage\.setItem\(storageKey/);

  assert.match(portal, /href="manifest\/"/);
  assert.match(portal, /Reality Builder/);
  assert.doesNotMatch(html, /guaranteed manifestation/i);
  assert.doesNotMatch(html, /manifest anything instantly/i);
  assert.doesNotMatch(html, /magical control over reality/i);
});

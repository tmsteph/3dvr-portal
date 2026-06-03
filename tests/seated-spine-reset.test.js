import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('seated spine reset ships as a standalone wellness app', async () => {
  const html = await readFile(new URL('../seated-spine-reset/index.html', import.meta.url), 'utf8');
  const css = await readFile(new URL('../seated-spine-reset/styles.css', import.meta.url), 'utf8');
  const js = await readFile(new URL('../seated-spine-reset/app.js', import.meta.url), 'utf8');
  const manifest = await readFile(new URL('../seated-spine-reset/manifest.webmanifest', import.meta.url), 'utf8');
  const portalIndex = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const wellness = await readFile(new URL('../wellness.html', import.meta.url), 'utf8');

  assert.match(html, /Seated Spine Reset/);
  assert.match(html, /A quiet 3&ndash;5 minute reset for neck, shoulders, spine, hips, and breath\./);
  assert.match(html, /data-start-mode="full"/);
  assert.match(html, /data-start-mode="quick"/);
  assert.match(html, /data-pref="reduceMotion"/);
  assert.match(html, /data-pref="silentMode"/);
  assert.match(html, /data-three-canvas/);
  assert.match(html, /class="fallback-figure"/);
  assert.match(html, /cdnjs\.cloudflare\.com\/ajax\/libs\/three\.js\/r128\/three\.min\.js/);
  assert.match(html, /Move gently\. Stop if you feel sharp pain/);

  assert.match(css, /dark/);
  assert.match(css, /--amber/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /min-height: var\(--tap\)/);

  assert.match(js, /const fullRoutine = \[/);
  assert.match(js, /Crown Up Posture Reset/);
  assert.match(js, /Invisible Show-Cue Reset/);
  assert.match(js, /const quickRoutine = \[/);
  assert.match(js, /localStorage\.setItem\(STORAGE_KEY/);
  assert.match(js, /window\.SeatedSpineReset/);
  assert.match(js, /webGLAvailable/);
  assert.match(js, /new THREE\.WebGLRenderer/);
  assert.match(js, /navigator\.vibrate/);
  assert.match(js, /silentMode: true/);

  assert.match(manifest, /"start_url": "\/seated-spine-reset\/\?source=pwa"/);
  assert.match(portalIndex, /href="seated-spine-reset\/"/);
  assert.match(portalIndex, /<span class="app-card__title">Seated Spine Reset<\/span>/);
  assert.match(wellness, /href="seated-spine-reset\/"/);
});

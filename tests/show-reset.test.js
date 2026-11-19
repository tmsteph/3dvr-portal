import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('show reset ships as a standalone rolling wellness app', async () => {
  const html = await readFile(new URL('../show-reset/index.html', import.meta.url), 'utf8');
  const css = await readFile(new URL('../show-reset/styles.css', import.meta.url), 'utf8');
  const js = await readFile(new URL('../show-reset/app.js', import.meta.url), 'utf8');
  const manifest = await readFile(new URL('../show-reset/manifest.webmanifest', import.meta.url), 'utf8');
  const wellness = await readFile(new URL('../wellness.html', import.meta.url), 'utf8');
  const serviceWorker = await readFile(new URL('../service-worker.js', import.meta.url), 'utf8');

  assert.match(html, /Show Reset/);
  assert.match(html, /It just keeps rolling/);
  assert.match(html, /data-squat-chip/);
  assert.match(html, /data-pref="soundOn"/);
  assert.match(html, /data-pref="includeStanding"/);
  assert.match(html, /data-guide-video/);
  assert.match(html, /Move gently\. Stop if you feel sharp pain/);

  assert.match(css, /--amber/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /\.squat-chip/);

  assert.match(js, /Butt Clenches/);
  assert.match(js, /Walk Break/);
  assert.match(js, /10 Squats/);
  assert.match(js, /soundOn: false/);
  assert.match(js, /showReset\.prefs\.v1/);
  assert.match(js, /window\.ShowReset/);

  assert.match(manifest, /"start_url": "\/show-reset\/\?source=pwa"/);
  assert.match(wellness, /href="show-reset\/"/);
  assert.match(serviceWorker, /'\/show-reset\/app\.js'/);
});

test('show reset rotation expands sides and honors the standing toggle', async () => {
  await import('../show-reset/app.js');
  const { buildRotation, stepSeconds, SQUAT_STEP, SQUAT_INTERVAL_MS } = globalThis.ShowReset;

  const full = buildRotation({});
  const titles = full.map((step) => step.title);
  assert.ok(titles.includes('Butt Clenches'));
  assert.ok(titles.includes('Walk Break'));
  assert.equal(full.filter((step) => step.title === 'Neck Side Stretch').length, 2);
  assert.ok(full.every((step) => step.totalSeconds > 0));

  const seatedOnly = buildRotation({ includeStanding: false });
  assert.ok(seatedOnly.length < full.length);
  assert.ok(!seatedOnly.some((step) => step.group === 'standing' || step.group === 'walk'));
  assert.ok(seatedOnly.some((step) => step.title === 'Butt Clenches'));

  assert.equal(stepSeconds(SQUAT_STEP), 40);
  assert.equal(SQUAT_INTERVAL_MS, 45 * 60 * 1000);
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('squat timer ships as a standalone wellness app', async () => {
  const html = await readFile(new URL('../squat-timer/index.html', import.meta.url), 'utf8');
  const css = await readFile(new URL('../squat-timer/styles.css', import.meta.url), 'utf8');
  const js = await readFile(new URL('../squat-timer/app.js', import.meta.url), 'utf8');
  const manifest = await readFile(new URL('../squat-timer/manifest.webmanifest', import.meta.url), 'utf8');
  const wellness = await readFile(new URL('../wellness.html', import.meta.url), 'utf8');
  const serviceWorker = await readFile(new URL('../service-worker.js', import.meta.url), 'utf8');

  assert.match(html, /Squat Timer/);
  assert.match(html, /Ten squats every 45 minutes/);
  assert.match(html, /id="intervalSelect"/);
  assert.match(html, /id="repsSelect"/);
  assert.match(html, /id="squatPanel"/);
  assert.match(html, /id="repButton"/);
  assert.match(html, /Tap for each squat/);
  assert.match(html, /3dvr-girl\/assets\/courtyard-warrior\.jpg/);
  assert.match(html, /not medical advice/);

  assert.match(css, /color-scheme: dark/);
  assert.match(css, /--amber/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /@media \(max-width: 520px\)/);

  assert.match(js, /intervalMin: 45/);
  assert.match(js, /reps: 10/);
  assert.match(js, /squatTimer\.stats\.v1/);
  assert.match(js, /squatTimer\.settings\.v1/);
  assert.match(js, /function currentStreak/);
  assert.match(js, /navigator\.vibrate/);
  assert.match(js, /Notification\.requestPermission/);
  assert.match(js, /QUOTES = \[/);

  assert.match(manifest, /"start_url": "\/squat-timer\/\?source=pwa"/);
  assert.match(manifest, /"short_name": "Squats"/);

  assert.match(wellness, /href="squat-timer\/"/);
  assert.match(serviceWorker, /'\/squat-timer\/app\.js'/);
});

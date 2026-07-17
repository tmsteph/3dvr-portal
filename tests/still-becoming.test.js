import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Still Becoming is a self-contained portal experience', async () => {
  const html = await readFile(new URL('../still-becoming/index.html', import.meta.url), 'utf8');

  assert.match(html, /Still Becoming \| 3dvr Portal/);
  assert.match(html, /href="\.\.\/">3dvr portal<\/a>/);
  assert.match(html, /Press play\. Let the room breathe with you\./);
  assert.match(html, /AudioContext/);
  assert.match(html, /createAnalyser\(\)/);
  assert.match(html, /pointermove/);
  assert.match(html, /setAttribute\('aria-label', 'Pause sound'\)/);
  assert.doesNotMatch(html, /<audio|<video|https?:\/\//);
});

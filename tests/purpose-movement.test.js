import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('purpose movement page ships the 3DVR framing deck', async () => {
  const html = await readFile(new URL('../purpose-movement/index.html', import.meta.url), 'utf8');
  const css = await readFile(new URL('../purpose-movement/styles.css', import.meta.url), 'utf8');
  const portal = await readFile(new URL('../index.html', import.meta.url), 'utf8');

  assert.match(html, /Purpose to Vision to Movement to Launch/);
  assert.match(html, /3DVR helps people see the movement inside themselves/);
  assert.match(html, /Purpose -&gt; Vision|Purpose -&gt; Vision|Purpose -> Vision/);
  assert.match(html, /We help you discover the world inside you and build the first doorway into it/);
  assert.match(html, /3DVR exists to help ordinary people become founders of meaningful movements/);
  assert.match(html, /id="slide-16"/);
  assert.match(html, /href="..\/launch-room\/"/);
  assert.match(html, /You do not need to leave your job to become a builder/);
  assert.match(html, /Startup skills are opportunity-creation skills/);
  assert.match(html, /href="..\/career-launch\/"/);
  assert.match(html, /href="..\/opportunity-builder\/"/);

  assert.match(css, /\.deck-hero/);
  assert.match(css, /\.slide--north-star/);

  assert.match(portal, /href="purpose-movement\/"/);
  assert.match(portal, /Purpose Movement/);
});

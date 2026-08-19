import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('human value network page ships the skill-sharing journey', async () => {
  const html = await readFile(new URL('../human-value-network/index.html', import.meta.url), 'utf8');
  const css = await readFile(new URL('../human-value-network/styles.css', import.meta.url), 'utf8');
  const app = await readFile(new URL('../human-value-network/app.js', import.meta.url), 'utf8');

  assert.match(html, /We already have what we need\. We have each other\./);
  assert.match(html, /Nobody else has your exact stack/);
  assert.match(html, /Build an economy we would rather live in/);
  assert.match(html, /Buy from ourselves/);
  assert.match(html, /Skill-share/);
  assert.match(html, /id="niche-lab"/);
  assert.match(html, /Build my value map/);
  assert.match(html, /href="..\/launch-room\/"/);
  assert.match(html, /href="..\/community\/index\.html"/);

  assert.match(css, /\.value-shell/);
  assert.match(css, /\.niche-form/);
  assert.match(css, /@media \(max-width: 760px\)/);

  assert.match(app, /3dvr-human-value-network/);
  assert.match(app, /navigator\.clipboard\.writeText/);
  assert.match(app, /localStorage\.setItem/);
});

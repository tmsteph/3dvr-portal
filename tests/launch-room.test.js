import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('launch room route connects the existing portal modules', async () => {
  const html = await readFile(new URL('../launch-room/index.html', import.meta.url), 'utf8');
  const css = await readFile(new URL('../launch-room/styles.css', import.meta.url), 'utf8');
  const portal = await readFile(new URL('../index.html', import.meta.url), 'utf8');

  assert.match(html, /3DVR Launch Room/);
  assert.match(html, /guided workspace for independent builders turning rough ideas into real digital projects/);
  assert.match(html, /Bring your idea into the Launch Room\. Leave with a page, a plan, a way to collect leads, and a path to payment\./);
  assert.match(html, /href="..\/projects\/index\.html"/);
  assert.match(html, /href="..\/web-builder-app\/index\.html"/);
  assert.match(html, /href="..\/website-builder\.html"/);
  assert.match(html, /href="..\/lead-generation\.html"/);
  assert.match(html, /href="..\/crm\/index\.html"/);
  assert.match(html, /href="..\/contacts\/index\.html"/);
  assert.match(html, /href="..\/tasks\/"/);
  assert.match(html, /href="..\/billing\/index\.html"/);
  assert.match(html, /href="..\/email-operator\/index\.html"/);
  assert.match(html, /href="..\/sales\/index\.html"/);

  assert.match(css, /\.launch-room__module-grid/);
  assert.match(css, /\.launch-room__core-copy/);

  assert.match(portal, /href="launch-room\/"/);
  assert.match(portal, /Launch Room/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const joinUrl = new URL('../portal.3dvr.tech/video/join.html', import.meta.url);
const indexUrl = new URL('../portal.3dvr.tech/video/index.html', import.meta.url);
const opsUrl = new URL('../portal.3dvr.tech/video/ops.html', import.meta.url);
const launcherUrl = new URL('../portal.3dvr.tech/video/smart-launcher.html', import.meta.url);

test('smart join page profiles device conditions and prefers Chrome on Android', async () => {
  const html = await readFile(joinUrl, 'utf8');

  assert.match(html, /<title>3dvr\.tech Smart Join<\/title>/);
  assert.match(html, /<h1>Smart Join<\/h1>/);
  assert.match(html, /network and device hints/i);
  assert.match(html, /navigator\.hardwareConcurrency/);
  assert.match(html, /navigator\.deviceMemory/);
  assert.match(html, /navigator\.connection/);
  assert.match(html, /function pickSmartProfile/);
  assert.match(html, /function buildChromeIntent/);
  assert.match(html, /com\.android\.chrome/);
  assert.match(html, /play\.google\.com\/store\/apps\/details\?id=com\.android\.chrome/);
  assert.match(html, /Open recommended meeting/);
  assert.match(html, /Open in Chrome/);
});

test('video surfaces link into smart join entrypoint', async () => {
  const indexHtml = await readFile(indexUrl, 'utf8');
  const opsHtml = await readFile(opsUrl, 'utf8');
  const launcherHtml = await readFile(launcherUrl, 'utf8');

  assert.match(indexHtml, /href="\/portal\.3dvr\.tech\/video\/join\.html"/);
  assert.match(indexHtml, /Smart Join/);
  assert.match(opsHtml, /href="\/portal\.3dvr\.tech\/video\/join\.html"/);
  assert.match(opsHtml, /Smart Join/);
  assert.match(launcherHtml, /href="\/portal\.3dvr\.tech\/video\/join\.html"/);
  assert.match(launcherHtml, /Smart Join/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('connect device guide exposes agent bootstrap and server approval flow', async () => {
  const html = await readFile(new URL('../deployment-guides/connect-device.html', import.meta.url), 'utf8');

  assert.match(html, /3dvr device bootstrap/);
  assert.match(html, /3dvr device approve/);
  assert.match(html, /167\.172\.193\.194/);
  assert.match(html, /3dvr-connect-device\.sh/);
  assert.match(html, /ssh do-dev\s+work/);
});

test('deployment guide index links to connect device flow', async () => {
  const html = await readFile(new URL('../deployment-guides/index.html', import.meta.url), 'utf8');

  assert.match(html, /connect-device\.html/);
  assert.match(html, /Connect a new device/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const launcherUrl = new URL('../portal.3dvr.tech/video/smart-launcher.html', import.meta.url);
const docUrl = new URL('../docs/video-control-layer.md', import.meta.url);

test('smart launcher exposes explicit roles, safe defaults, and local persistence', async () => {
  const html = await readFile(launcherUrl, 'utf8');

  assert.match(html, /<label for="joinRole">Join role<\/label>/);
  assert.match(html, /<option value="participant" selected>Participant<\/option>/);
  assert.match(html, /<option value="director">Director<\/option>/);
  assert.match(html, /<option value="front">Front camera test<\/option>/);
  assert.match(html, /<option value="back">Back camera test<\/option>/);
  assert.match(html, /<input id="push" type="checkbox" \/>/);
  assert.match(html, /Reset to safe defaults/);
  assert.match(html, /const storageKey = '3dvr-smart-launcher-state-v1'/);
  assert.match(html, /function syncRoleDefaults/);
  assert.match(html, /params\.set\('director', ''\)/);
  assert.match(html, /params\.set\('vdo', 'rear'\)/);
});

test('video control layer phases are documented in-repo', async () => {
  const doc = await readFile(docUrl, 'utf8');

  assert.match(doc, /# Video Control Layer/);
  assert.match(doc, /## Phase 1/);
  assert.match(doc, /participant, director, front camera test, back camera test/i);
  assert.match(doc, /Do not package first\./);
});

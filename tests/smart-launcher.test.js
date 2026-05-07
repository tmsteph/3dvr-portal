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
  assert.match(html, /Copy managed launcher URL/);
  assert.match(html, /const storageKey = '3dvr-smart-launcher-state-v1'/);
  assert.match(html, /function syncRoleDefaults/);
  assert.match(html, /params\.set\('director', ''\)/);
  assert.match(html, /params\.set\('vdo', 'rear'\)/);
});

test('smart launcher includes a shared control channel and managed launcher flow', async () => {
  const html = await readFile(launcherUrl, 'utf8');

  assert.match(html, /<h2>Control Channel<\/h2>/);
  assert.match(html, /<input id="controlToken"/);
  assert.match(html, /<select id="controlMode">/);
  assert.match(html, /Guest listener/);
  assert.match(html, /Host control/);
  assert.match(html, /<input id="monitorCommands" type="checkbox" checked/);
  assert.match(html, /<input id="autoApplyCommands" type="checkbox"/);
  assert.match(html, /id="copyControlUrl"/);
  assert.match(html, /id="sendDowngrade"/);
  assert.match(html, /id="sendReset"/);
  assert.match(html, /https:\/\/cdn\.jsdelivr\.net\/npm\/gun\/gun\.js/);
  assert.match(html, /<script defer src="\/gun-init\.js"><\/script>/);
  assert.match(html, /const controlEventKey = '3dvr-smart-launcher-control-event-v1'/);
  assert.match(html, /function getManagedLauncherUrl/);
  assert.match(html, /function ensureControlTransport/);
  assert.match(html, /controlNode = gun\.get\('portalVideoControl'\)/);
  assert.match(html, /publishControlCommand\('downgrade'/);
  assert.match(html, /publishControlCommand\('reset'/);
  assert.match(html, /window\.localStorage\.setItem\(controlEventKey/);
});

test('video control layer phases are documented in-repo', async () => {
  const doc = await readFile(docUrl, 'utf8');

  assert.match(doc, /# Video Control Layer/);
  assert.match(doc, /## Phase 1/);
  assert.match(doc, /participant, director, front camera test, back camera test/i);
  assert.match(doc, /managed launcher URL/i);
  assert.match(doc, /Gun when available and fall back to browser channels/i);
  assert.match(doc, /Do not package first\./);
});

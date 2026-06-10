import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('zero-g ski range exposes first-person ski-shooter mechanics', async () => {
  const html = await readFile(new URL('../tribes-flight.html', import.meta.url), 'utf8');

  assert.match(html, /<title>3DVR - Zero-G Ski Range<\/title>/);
  assert.match(html, /First-person ski-shooter range\./);
  assert.match(html, /requestPointerLock/);
  assert.match(html, /const SKI_ACCEL = 90;/);
  assert.match(html, /const JETPACK_FORCE = 62;/);
  assert.match(html, /Disc Launcher/);
  assert.match(html, /Trace Repeater/);
  assert.match(html, /data-action="ski"/);
  assert.match(html, /data-action="jet"/);
  assert.match(html, /function drawWeaponView\(\)/);
  assert.match(html, /function drawTargets\(\)/);
});


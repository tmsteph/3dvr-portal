import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('stellar drift supports keyboard-only flight controls', async () => {
  const html = await readFile(new URL('../stellar-flight.html', import.meta.url), 'utf8');

  assert.match(html, /<strong>Arrow Keys<\/strong> or mouse to\s+look/);
  assert.match(html, /<strong>E\/Ctrl<\/strong> to climb or drop/);
  assert.match(html, /fire with <strong>Space<\/strong>, <strong>Enter<\/strong>,\s+<strong>F<\/strong>, or left-click/);

  assert.match(html, /const keyboardLookSpeed = 0\.9;/);
  assert.match(html, /const keyboardPitchSpeed = 0\.72;/);
  assert.match(html, /'ArrowUp'/);
  assert.match(html, /'ArrowDown'/);
  assert.match(html, /'ArrowLeft'/);
  assert.match(html, /'ArrowRight'/);
  assert.match(html, /'Enter'/);
  assert.match(html, /'KeyE'/);
  assert.match(html, /'NumpadEnter'/);

  assert.match(
    html,
    /const lookYaw = \(keys\.has\('ArrowLeft'\) \? 1 : 0\) - \(keys\.has\('ArrowRight'\) \? 1 : 0\);/
  );
  assert.match(
    html,
    /const lookPitch = \(keys\.has\('ArrowUp'\) \? 1 : 0\) - \(keys\.has\('ArrowDown'\) \? 1 : 0\);/
  );
  assert.match(html, /const keyboardLookDelta = Math\.min\(delta, 1 \/ 30\);/);
  assert.match(html, /yaw \+= lookYaw \* keyboardLookSpeed \* keyboardLookDelta;/);
  assert.match(html, /pitch \+= lookPitch \* keyboardPitchSpeed \* keyboardLookDelta;/);
  assert.match(
    html,
    /event\.code === 'Space' \|\| event\.code === 'KeyF' \|\| event\.code === 'Enter' \|\| event\.code === 'NumpadEnter'/
  );

  assert.match(
    html,
    /if \(keys\.has\('KeyE'\)\) \{\s+velocity\.addScaledVector\(vertical, acceleration \* delta\);\s+\}/
  );
  assert.match(html, /event\.code === 'Space'[\s\S]{0,160}triggerLaserBurst/);
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('seated spine reset loops, splits sides, and is guided by 3DVR Girl media', async () => {
  const html = await readFile(new URL('../seated-spine-reset/index.html', import.meta.url), 'utf8');
  const js = await readFile(new URL('../seated-spine-reset/app.js', import.meta.url), 'utf8');

  // Loop mode: a setting on the landing screen and in the routine header.
  assert.match(html, /data-pref="loopRoutine"/);
  assert.match(html, /Loop Routine/);
  assert.match(html, /data-action="end"/);

  // Guide media: her video and still elements live in the visual stage.
  assert.match(html, /data-guide-video/);
  assert.match(html, /data-guide-image/);
  assert.match(html, /data-guide-label/);
  assert.match(html, /3dvr-girl\/assets\/meditation-breathing-loop\.mp4/);
  assert.match(html, /Guided by/);

  // Side banner shows which side is counting down.
  assert.match(html, /data-side-banner/);

  // Loop defaults on, completes into the next round.
  assert.match(js, /loopRoutine: true/);
  assert.match(js, /roundCount \+= 1/);
  assert.match(js, /function endRoutine/);

  // Separate countdowns per side for the two-sided steps.
  assert.match(js, /sides: \['Left side', 'Right side'\]/);
  assert.match(js, /sides: \['Looking right', 'Looking left'\]/);
  assert.match(js, /sides: \['Right side', 'Left side'\]/);
  assert.match(js, /function advanceSide/);
  assert.match(js, /function phaseDurationMs/);

  // Guide media mapping uses her loops for breath and wave, stills elsewhere.
  assert.match(js, /GUIDE_MEDIA = \{/);
  assert.match(js, /base: 'meditation-breathing-loop'/);
  assert.match(js, /base: 'courtyard-flow-loop'/);
  assert.match(js, /src: 'meditation-seat\.png'/);
  assert.match(js, /function updateGuideMedia/);
});

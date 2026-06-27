import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import {
  BODY_MODE_KEYS,
  getBodyModeApp,
  readBodyModePreferences,
  setBodyModeLastUsed,
  writeBodyModePreference,
} from '../body-mode/body-mode.js';
import {
  SEATED_SPINE_STEPS,
  calculateRoutineProgress,
  formatDuration,
  getRoutineDuration,
} from '../body-mode/seated-spine-reset/seated-spine-reset.js';

async function fileExists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch (_error) {
    return false;
  }
}

function createMemoryStorage(seed = {}) {
  const store = new Map(Object.entries(seed));
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
  };
}

test('Body Mode landing page ships the requested wellness-tech section', async () => {
  const appDir = new URL('../body-mode/', import.meta.url);
  assert.equal(await fileExists(new URL('index.html', appDir)), true);
  assert.equal(await fileExists(new URL('styles.css', appDir)), true);
  assert.equal(await fileExists(new URL('body-mode.js', appDir)), true);

  const html = await readFile(new URL('index.html', appDir), 'utf8');
  const css = await readFile(new URL('styles.css', appDir), 'utf8');
  const js = await readFile(new URL('body-mode.js', appDir), 'utf8');

  assert.match(html, /<title>Body Mode \| 3DVR Portal<\/title>/);
  assert.match(html, /A sensory-friendly reset system for people who live through screens\./);
  assert.match(html, /Technology should help us return to the body, not escape it\./);
  assert.match(html, /Seated Spine Reset/);
  assert.match(html, /Breathing Room/);
  assert.match(html, /Integration Journal/);
  assert.match(html, /One Next Action/);
  assert.match(html, /Sleep Wind-Down/);
  assert.match(html, /These tools support reflection, relaxation, and self-care/);
  assert.match(html, /They are not medical advice or a substitute for\s+professional care/);
  assert.match(html, /id="reduceMotionToggle"/);
  assert.match(html, /id="preferredMode"/);
  assert.match(html, /id="lastUsedApp"/);
  assert.match(html, /href="\/app-manifests\/body-mode\.webmanifest"/);
  assert.match(html, /<script defer src="\/_vercel\/insights\/script\.js"><\/script>/);
  assert.doesNotMatch(html, /DMT|curing|cures|treating trauma/i);

  assert.match(css, /--body-bg: #0d0b09/);
  assert.match(css, /\[data-reduce-motion="true"\]/);
  assert.match(css, /\.app-grid/);
  assert.match(css, /\.routine-layout/);

  assert.match(js, /bodyMode\.reduceMotion/);
  assert.match(js, /bodyMode\.preferredMode/);
  assert.match(js, /bodyMode\.lastUsedApp/);
  assert.match(js, /data-body-app/);
});

test('Seated Spine Reset ships a working guided reset route', async () => {
  const resetDir = new URL('../body-mode/seated-spine-reset/', import.meta.url);
  assert.equal(await fileExists(new URL('index.html', resetDir)), true);
  assert.equal(await fileExists(new URL('seated-spine-reset.js', resetDir)), true);

  const html = await readFile(new URL('index.html', resetDir), 'utf8');
  const js = await readFile(new URL('seated-spine-reset.js', resetDir), 'utf8');

  assert.match(html, /Seated Spine Reset \| Body Mode/);
  assert.match(html, /neck, shoulders, spine, hips, and breath/);
  assert.match(html, /id="timeRemaining"/);
  assert.match(html, /id="stepList"/);
  assert.match(html, /id="startPauseButton"/);
  assert.match(html, /id="routineProgress"/);
  assert.match(html, /body-line__shoulders/);
  assert.match(html, /They are not medical advice or a substitute for\s+professional care/);
  assert.match(html, /<script defer src="\/_vercel\/insights\/script\.js"><\/script>/);
  assert.doesNotMatch(html, /DMT|curing|cures|treating trauma/i);

  assert.match(js, /SEATED_SPINE_STEPS/);
  assert.match(js, /setBodyModeLastUsed\('seated-spine-reset'\)/);
  assert.match(js, /setInterval/);
  assert.match(js, /Step \$\{state\.stepIndex \+ 1\} of/);
});

test('Body Mode preferences use the requested localStorage keys', () => {
  const storage = createMemoryStorage();
  let preferences = readBodyModePreferences(storage);
  assert.equal(preferences.reduceMotion, false);
  assert.equal(preferences.preferredMode, 'work-reset');
  assert.equal(preferences.lastUsedApp, '');

  preferences = writeBodyModePreference('reduceMotion', true, storage);
  assert.equal(preferences.reduceMotion, true);
  assert.equal(storage.getItem(BODY_MODE_KEYS.reduceMotion), 'true');

  preferences = writeBodyModePreference('preferredMode', 'sleep-wind-down', storage);
  assert.equal(preferences.preferredMode, 'sleep-wind-down');
  assert.equal(storage.getItem(BODY_MODE_KEYS.preferredMode), 'sleep-wind-down');

  preferences = setBodyModeLastUsed('seated-spine-reset', storage);
  assert.equal(preferences.lastUsedApp, 'seated-spine-reset');
  assert.equal(storage.getItem(BODY_MODE_KEYS.lastUsedApp), 'seated-spine-reset');
  assert.equal(getBodyModeApp(preferences.lastUsedApp).title, 'Seated Spine Reset');
});

test('Seated Spine Reset timing helpers stay inside a 3-5 minute routine', () => {
  const totalDuration = getRoutineDuration(SEATED_SPINE_STEPS);
  assert.equal(SEATED_SPINE_STEPS.length, 7);
  assert.ok(totalDuration >= 180);
  assert.ok(totalDuration <= 300);
  assert.equal(formatDuration(totalDuration), '04:05');
  assert.equal(formatDuration(0), '00:00');
  assert.equal(formatDuration(65), '01:05');
  assert.equal(calculateRoutineProgress(0, SEATED_SPINE_STEPS[0].duration), 0);
  assert.equal(calculateRoutineProgress(SEATED_SPINE_STEPS.length - 1, 0), 1);
});

test('Portal registry and docs link to Body Mode', async () => {
  const portal = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const wellness = await readFile(new URL('../wellness.html', import.meta.url), 'utf8');
  const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');
  const manifest = await readFile(new URL('../app-manifests/body-mode.webmanifest', import.meta.url), 'utf8');

  assert.match(portal, /href="body-mode\/"/);
  assert.match(
    portal,
    /href="body-mode\/"\s*class="app-card"\s*data-app-tier="experimental"\s*data-app-keywords="body mode wellness posture breathing nervous system sensory reset sleep action"\s*>\s*<span class="app-card__badge">Experimental<\/span>/
  );
  assert.match(portal, />Body Mode</);
  assert.match(portal, /sensory-friendly breath, posture, reflection, and action tools/);
  assert.match(wellness, /href="body-mode\/"/);
  assert.match(readme, /\[Body Mode\]\(https:\/\/3dvr-portal\.vercel\.app\/body-mode\/\)/);
  assert.match(manifest, /3DVR Body Mode/);
  assert.match(manifest, /"start_url": "\/body-mode\/\?source=pwa"/);
  assert.match(manifest, /"scope": "\/body-mode\/"/);
});

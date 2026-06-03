import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import {
  INNER_ALIGNMENT_CATEGORIES,
  INNER_ALIGNMENT_KEYS,
  INNER_ALIGNMENT_PRACTICES,
  buildPracticeSession,
  formatPracticeDuration,
  getInnerAlignmentPractice,
  getPracticesByCategory,
  readInnerAlignmentList,
  readInnerAlignmentPreferences,
  savePracticeSession,
  writeInnerAlignmentPreferences,
} from '../inner-alignment/practices.js';

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

test('Inner Alignment ships a standalone Three.js wellness app route', async () => {
  const appDir = new URL('../inner-alignment/', import.meta.url);
  assert.equal(await fileExists(new URL('index.html', appDir)), true);
  assert.equal(await fileExists(new URL('style.css', appDir)), true);
  assert.equal(await fileExists(new URL('app.js', appDir)), true);
  assert.equal(await fileExists(new URL('three-scene.js', appDir)), true);
  assert.equal(await fileExists(new URL('practices.js', appDir)), true);

  const html = await readFile(new URL('index.html', appDir), 'utf8');
  const css = await readFile(new URL('style.css', appDir), 'utf8');
  const app = await readFile(new URL('app.js', appDir), 'utf8');
  const scene = await readFile(new URL('three-scene.js', appDir), 'utf8');
  const manifest = await readFile(new URL('../app-manifests/inner-alignment.webmanifest', import.meta.url), 'utf8');

  assert.match(html, /<title>Inner Alignment \| 3DVR Portal<\/title>/);
  assert.match(html, /Body, breath, attention, and action\./);
  assert.match(html, /Use the body as the interface for consciousness/);
  assert.match(html, /Practice library/);
  assert.match(html, /id="categoryFilters"/);
  assert.match(html, /id="practiceGrid"/);
  assert.match(html, /three@0\.160\.0\/build\/three\.module\.js/);
  assert.match(html, /This app is for general wellness and reflection/);
  assert.match(html, /not medical advice/);
  assert.match(html, /<meta name="analytics" content="disabled">/);
  assert.doesNotMatch(html, /promise enlightenment|cure|treat disease|medical treatment/i);

  assert.match(css, /--inner-bg: #0f0c09/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /\.visual-stage/);

  assert.match(app, /window\.InnerAlignment/);
  assert.match(app, /setSyncBridge/);
  assert.match(app, /INNER_ALIGNMENT_KEYS\.activePractice/);
  assert.match(scene, /from 'three'/);
  assert.match(scene, /breathing-orb/);
  assert.match(scene, /spine-wave/);
  assert.match(scene, /heart-light/);
  assert.match(scene, /third-eye-focus/);
  assert.match(scene, /rising-particles/);
  assert.match(scene, /mandala-calm/);

  assert.match(manifest, /3DVR Inner Alignment/);
  assert.match(manifest, /"start_url": "\/inner-alignment\/\?source=pwa"/);
  assert.match(manifest, /"scope": "\/inner-alignment\/"/);
});

test('Inner Alignment practice library includes requested starter practices and categories', () => {
  const titles = INNER_ALIGNMENT_PRACTICES.map(practice => practice.title);
  assert.equal(INNER_ALIGNMENT_PRACTICES.length, 10);
  assert.deepEqual(INNER_ALIGNMENT_CATEGORIES, [
    'Seated Body Reset',
    'Breath & Nervous System',
    'Focus & Awareness',
    'Light / Energy Visualization',
    'Intention Into Action',
  ]);
  [
    'Seated Spinal Wave',
    'Neck & Shoulder Release',
    'Chest Opener',
    'Wrist & Forearm Reset',
    'Box Breathing',
    'Long Exhale Calm',
    'Third-Eye Focus',
    'Heart Light Gratitude',
    'Observe the Observer',
    'Intention Into Action',
  ].forEach(title => assert.ok(titles.includes(title), title));

  const spinalWave = getInnerAlignmentPractice('seated-spinal-wave');
  assert.equal(spinalWave.visual, 'spine-wave');
  assert.equal(spinalWave.breathPattern, 'inhale-exhale');
  assert.ok(spinalWave.instructions.length >= 4);
  assert.equal(getPracticesByCategory('Breath & Nervous System').length, 2);
});

test('Inner Alignment localStorage helpers use clear local keys', () => {
  assert.deepEqual(INNER_ALIGNMENT_KEYS, {
    preferences: 'innerAlignment.preferences',
    sessions: 'innerAlignment.sessions',
    activePractice: 'innerAlignment.activePractice',
    reflections: 'innerAlignment.reflections',
  });

  const storage = createMemoryStorage();
  assert.deepEqual(readInnerAlignmentList('sessions', storage), []);
  let preferences = readInnerAlignmentPreferences(storage);
  assert.equal(preferences.reduceMotion, false);
  assert.equal(preferences.lastPracticeId, 'seated-spinal-wave');

  preferences = writeInnerAlignmentPreferences({
    reduceMotion: true,
    lastPracticeId: 'third-eye-focus',
  }, storage);
  assert.equal(preferences.reduceMotion, true);
  assert.equal(preferences.lastPracticeId, 'third-eye-focus');
  assert.match(storage.getItem(INNER_ALIGNMENT_KEYS.preferences), /third-eye-focus/);
});

test('Inner Alignment sessions save reflection and one real-world action locally', () => {
  const storage = createMemoryStorage();
  const session = savePracticeSession({
    id: 'inner-test',
    practiceId: 'long-exhale-calm',
    reflection: 'My shoulders dropped.',
    action: 'Take a walk after this.',
  }, storage);

  assert.equal(session.id, 'inner-test');
  assert.equal(session.app, 'inner-alignment');
  assert.equal(session.practiceTitle, 'Long Exhale Calm');
  assert.equal(session.category, 'Breath & Nervous System');
  assert.equal(readInnerAlignmentList('sessions', storage).length, 1);
  assert.equal(readInnerAlignmentList('reflections', storage).length, 1);
  assert.match(storage.getItem(INNER_ALIGNMENT_KEYS.sessions), /Take a walk after this/);

  const fallback = buildPracticeSession({ practiceId: 'unknown-practice' });
  assert.equal(fallback.practiceId, 'seated-spinal-wave');
});

test('Inner Alignment formats practice durations for timers', () => {
  assert.equal(formatPracticeDuration(0), '00:00');
  assert.equal(formatPracticeDuration(75), '01:15');
  assert.equal(formatPracticeDuration(180), '03:00');
});

test('Portal homepage, wellness directory, and README link to Inner Alignment', async () => {
  const portal = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const wellness = await readFile(new URL('../wellness.html', import.meta.url), 'utf8');
  const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');

  assert.match(portal, /href="inner-alignment\/"/);
  assert.match(portal, />Inner Alignment</);
  assert.match(portal, /seated resets, breathwork, attention, visualization, and one grounded action/);
  assert.match(wellness, /href="inner-alignment\/"/);
  assert.match(readme, /\[Inner Alignment\]\(https:\/\/3dvr-portal\.vercel\.app\/inner-alignment\/\)/);
});

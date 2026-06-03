import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import {
  PORTAL_LAB_KEYS,
  PORTAL_LAB_TOPICS,
  analyzeRandomnessGate,
  appendPortalLabEntry,
  buildRandomnessSession,
  generateBinaryValues,
  getResearchTopic,
  readPortalLabList,
  toggleFavoriteTopic,
} from '../portal-lab/portal-lab.js';

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

test('Portal Lab ships the requested standalone app and manifest', async () => {
  const appDir = new URL('../portal-lab/', import.meta.url);
  assert.equal(await fileExists(new URL('index.html', appDir)), true);
  assert.equal(await fileExists(new URL('portal-lab.css', appDir)), true);
  assert.equal(await fileExists(new URL('portal-lab.js', appDir)), true);
  assert.equal(await fileExists(new URL('../app-manifests/portal-lab.webmanifest', import.meta.url)), true);

  const html = await readFile(new URL('index.html', appDir), 'utf8');
  const css = await readFile(new URL('portal-lab.css', appDir), 'utf8');
  const manifest = await readFile(new URL('../app-manifests/portal-lab.webmanifest', import.meta.url), 'utf8');

  assert.match(html, /<title>Portal Lab \| 3DVR Portal<\/title>/);
  assert.match(html, /A practice \+ research space for exploring frequency, consciousness, coherence/);
  assert.match(html, /Mystery is allowed\. Fear is optional\. Evidence matters\. Experience matters/);
  assert.match(html, /Four Levels of the Portal Question/);
  assert.match(html, /Level 1: Frequency definitely affects consciousness/);
  assert.match(html, /Consciousness affecting randomness is testable/);
  assert.match(html, /Physical portal/);
  assert.match(html, /Portal Lab v0\.1/);
  assert.match(html, /Breath Gate/);
  assert.match(html, /Tone Gate/);
  assert.match(html, /Spine Gate/);
  assert.match(html, /Intention Gate/);
  assert.match(html, /Randomness Gate/);
  assert.match(html, /Dream Gate/);
  assert.match(html, /Group Gate/);
  assert.match(html, /Reality Check/);
  assert.match(html, /Research Atlas/);
  assert.match(html, /This is exploratory and not proof of paranormal ability/);
  assert.match(html, /Stop any practice that causes distress/);
  assert.match(html, /<meta name="analytics" content="disabled">/);
  assert.doesNotMatch(html, /Your thoughts control random numbers/i);
  assert.doesNotMatch(html, /Guaranteed manifestation/i);
  assert.doesNotMatch(html, /can heal disease/i);

  assert.match(css, /--portal-bg: #0d0a08/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /@keyframes breatheGate/);

  assert.match(manifest, /3DVR Portal Lab/);
  assert.match(manifest, /"start_url": "\/portal-lab\/\?source=pwa"/);
  assert.match(manifest, /"scope": "\/portal-lab\/"/);
});

test('Portal Lab uses the requested localStorage keys', () => {
  assert.deepEqual(PORTAL_LAB_KEYS, {
    intentions: 'portalLab.intentions',
    dreams: 'portalLab.dreams',
    synchs: 'portalLab.synchs',
    notes: 'portalLab.notes',
    sessions: 'portalLab.sessions',
    favorites: 'portalLab.favorites',
  });

  const storage = createMemoryStorage();
  assert.deepEqual(readPortalLabList('intentions', storage), []);
  const entry = appendPortalLabEntry('intentions', { id: 'intent-test', text: 'Breathe and act' }, storage);
  assert.equal(entry.id, 'intent-test');
  assert.equal(readPortalLabList('intentions', storage)[0].text, 'Breathe and act');
  assert.match(storage.getItem(PORTAL_LAB_KEYS.intentions), /Breathe and act/);
});

test('generateBinaryValues uses crypto.getRandomValues and returns exact binary samples', () => {
  const cryptoProvider = {
    getRandomValues(values) {
      values.forEach((_, index) => {
        values[index] = index;
      });
      return values;
    },
  };

  const values = generateBinaryValues(100, cryptoProvider);
  assert.equal(values.length, 100);
  assert.deepEqual(values.slice(0, 6), [0, 1, 0, 1, 0, 1]);
  assert.throws(() => generateBinaryValues(0, cryptoProvider), /between 1 and 10000/);
  assert.throws(() => generateBinaryValues(100, {}), /crypto\.getRandomValues is required/);
});

test('analyzeRandomnessGate reports above, below, and near chance honestly', () => {
  const above = analyzeRandomnessGate([
    ...Array(61).fill(1),
    ...Array(39).fill(0),
  ], 'more-ones');
  assert.equal(above.ones, 61);
  assert.equal(above.zeros, 39);
  assert.equal(above.classification, 'above chance');
  assert.match(above.interpretation, /exploratory data point/);

  const below = analyzeRandomnessGate([
    ...Array(61).fill(1),
    ...Array(39).fill(0),
  ], 'more-zeros');
  assert.equal(below.classification, 'below chance');

  const near = analyzeRandomnessGate([
    ...Array(53).fill(1),
    ...Array(47).fill(0),
  ], 'more-ones');
  assert.equal(near.classification, 'near chance');
});

test('buildRandomnessSession stores browser randomness source and neutral analysis', () => {
  const values = [
    ...Array(50).fill(1),
    ...Array(50).fill(0),
  ];
  const session = buildRandomnessSession({ id: 'session-test', values, intention: 'more-ones' });

  assert.equal(session.id, 'session-test');
  assert.equal(session.app, 'portal-lab');
  assert.equal(session.type, 'randomness-gate');
  assert.equal(session.version, 1);
  assert.equal(session.result.source, 'browser-crypto-getRandomValues');
  assert.equal(session.result.classification, 'near chance');
});

test('Research Atlas includes all requested starter topics and labels', () => {
  const titles = PORTAL_LAB_TOPICS.map(topic => topic.title);
  assert.equal(PORTAL_LAB_TOPICS.length, 8);
  assert.ok(titles.some(title => title.includes('Nikola Tesla')));
  assert.ok(titles.some(title => title.includes('Jack Parsons')));
  assert.ok(titles.some(title => title.includes('Project Gateway')));
  assert.ok(titles.some(title => title.includes('Project SCANATE')));
  assert.ok(titles.some(title => title.includes('Dugway Proving Ground')));
  assert.ok(titles.some(title => title.includes('CERN Ritual Myth')));
  assert.ok(titles.some(title => title.includes('Random Number Generators')));
  assert.ok(titles.some(title => title.includes('DMT / altered states')));

  const cern = getResearchTopic('cern-ritual-myth');
  assert.ok(cern.labels.includes('Myth / unverified'));
  assert.match(cern.warning, /Symbolic art is not proof/);
});

test('favorite topics are local-only and toggle through portalLab.favorites', () => {
  const storage = createMemoryStorage();
  let favorites = toggleFavoriteTopic('random-generators', storage);
  assert.deepEqual(favorites, ['random-generators']);
  assert.match(storage.getItem(PORTAL_LAB_KEYS.favorites), /random-generators/);

  favorites = toggleFavoriteTopic('random-generators', storage);
  assert.deepEqual(favorites, []);
  assert.throws(() => toggleFavoriteTopic('unknown-topic', storage), /Unknown Portal Lab topic/);
});

test('Portal homepage, Science Lab, and README link to Portal Lab', async () => {
  const portal = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const science = await readFile(new URL('../science/index.html', import.meta.url), 'utf8');
  const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');

  assert.match(portal, /href="portal-lab\/"/);
  assert.match(portal, />Portal Lab</);
  assert.match(portal, /data-app-tier="experimental"/);
  assert.match(portal, /Explore frequency, consciousness, coherence, ritual, and randomness/);
  assert.match(science, /href="\/portal-lab\/"/);
  assert.match(science, /Explore frequency, coherence, ritual, and randomness/);
  assert.match(readme, /\[Portal Lab\]\(https:\/\/3dvr-portal\.vercel\.app\/portal-lab\/\)/);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('Master Key Room ships as a local-first portal practice app', async () => {
  const html = await readFile(new URL('../master-key-room/index.html', import.meta.url), 'utf8');
  const portal = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');

  assert.match(html, /Master Key Room \| 3DVR Portal/);
  assert.match(html, /A 24-step inner engineering course inspired by Charles F\. Haanel/);
  assert.match(html, /The Grounded Manifestation Engine/);
  assert.match(html, /Attention<small>what you feed<\/small>/);
  assert.match(html, /Belief<small>what feels possible<\/small>/);
  assert.match(html, /State<small>body and emotion<\/small>/);
  assert.match(html, /Action<small>what you do<\/small>/);
  assert.match(html, /Reality<small>what changes<\/small>/);
  assert.match(html, /Use Mysticism Responsibly/);
  assert.match(html, /Reflection tool only/);
  assert.match(html, /not medical, mental health, legal, or financial advice/i);
  assert.match(html, /Your notes are saved in this browser only/);
  assert.match(html, /master-key-room\.current\.v1/);
  assert.match(html, /master-key-room\.completed\.v1/);
  assert.match(html, /master-key-room\.note\.v1\./);
  assert.match(html, /window\.MasterKeyRoom/);
  assert.match(html, /prefers-reduced-motion: reduce/);
  assert.match(html, /aria-current/);
  assert.match(html, /Done \$\{index \+ 1\}/);

  const lessonCount = (html.match(/title: '/g) || []).length;
  assert.equal(lessonCount, 24);
  assert.doesNotMatch(html, /Guaranteed manifestation/i);
  assert.doesNotMatch(html, /letter-spacing:\s*-/i);

  assert.match(portal, /href="master-key-room\/"/);
  assert.match(portal, /<span class="app-card__title">Master Key Room<\/span>/);
  assert.match(portal, /master key room haanel attention manifestation/);
  const logicIndex = portal.indexOf('>Logic Lab<');
  const masterKeyIndex = portal.indexOf('>Master Key Room<');
  const meditationIndex = portal.indexOf('>Meditation<');
  assert.ok(logicIndex < masterKeyIndex, 'Master Key Room should render after Logic Lab');
  assert.ok(masterKeyIndex < meditationIndex, 'Master Key Room should render before Meditation');

  assert.match(readme, /\[Master Key Room\]\(https:\/\/3dvr-portal\.vercel\.app\/master-key-room\/\)/);
});

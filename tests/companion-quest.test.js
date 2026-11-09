import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';

const appDir = new URL('../companion-quest/', import.meta.url);

async function fileExists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

test('companion quest page ships its experiment structure', async () => {
  const htmlUrl = new URL('index.html', appDir);
  assert.equal(await fileExists(htmlUrl), true);

  const html = await readFile(htmlUrl, 'utf8');
  assert.match(html, /<title>Companion · 3DVR experiment<\/title>/);
  assert.match(html, /EXPERIMENT/);
  assert.match(html, /id="game"/);
  assert.match(html, /id="bubble"/);
  assert.match(html, /id="select"/);
  assert.match(html, /id="roster"/);
  assert.match(html, /id="creator"/);
  assert.match(html, /id="chatPanel"/);
  assert.match(html, /id="chatInput"/);
  // Conversation only: the page says so, in plain words.
  assert.match(html, /Conversation only in here/);
});

test('companion chat forks the home operator plumbing, not a new endpoint', async () => {
  const html = await readFile(new URL('index.html', appDir), 'utf8');
  assert.match(html, /from '\/operator\/chat-preparation\.js'/);
  assert.match(html, /from '\/operator\/forge\.js'/);
  assert.match(html, /from '\/operator\/stream\.js'/);
  assert.match(html, /prepareOperatorChat\(/);
  assert.match(html, /createOperatorDeveloperProof/);
  assert.match(html, /fetchOperatorStream\(/);
  // The companion never runs action payloads itself.
  assert.match(html, /action payloads are never executed or claimed/);
  assert.doesNotMatch(html, /runOperatorAction/);
});

test('character system: presets and customs share one parametric renderer', async () => {
  const html = await readFile(new URL('index.html', appDir), 'utf8');
  assert.match(html, /function drawCharacter\(/);
  for (const name of ['Thomas', '3DVR Girl', 'Mark', 'Esai', 'David', 'Brandon']) {
    assert.match(html, new RegExp(`name: '${name}'`));
  }
  // Preset distinguishing features: beard, cap, blue streak.
  assert.match(html, /beard: true/);
  assert.match(html, /hairStyle: 'cap'/);
  assert.match(html, /streak: '#38bdf8'/);
  // Creator: the five hair styles and per-device persistence.
  for (const style of ['short', 'long', 'bun', 'mohawk', 'bald']) {
    assert.match(html, new RegExp(`<option value="${style}">`));
  }
  assert.match(html, /companion-quest\.customCharacters\.v1/);
  assert.match(html, /companion-quest\.player\.v1/);
});

test('music deck: one ad-free somaFM stream with a sticky mute', async () => {
  const html = await readFile(new URL('index.html', appDir), 'utf8');
  assert.match(html, /ice1\.somafm\.com\/groovesalad-128-mp3/);
  assert.match(html, /id="musicToggle"/);
  assert.match(html, /id="musicMute"/);
  assert.match(html, /companion-quest\.muted/);
});

test('games hub reaches the companion through the combined 3DVR World card', async () => {
  const games = await readFile(new URL('../games.html', import.meta.url), 'utf8');
  assert.match(games, /class="game-card world" href="\/3dvr-world\/"/);
  assert.match(games, /Companion/);
  assert.doesNotMatch(games, /game-card companion/);
});

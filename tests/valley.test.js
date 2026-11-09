import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import test from 'node:test';

async function fileExists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch (_error) {
    return false;
  }
}

test('valley ships a dependency-free ambient living scene', async () => {
  const appDir = new URL('../valley/', import.meta.url);
  assert.equal(await fileExists(new URL('index.html', appDir)), true);

  const html = await readFile(new URL('index.html', appDir), 'utf8');

  assert.match(html, /<title>Valley · 3DVR<\/title>/);
  assert.match(html, /<canvas id="scene"/);
  assert.match(html, /id="hudDay"/);
  assert.match(html, /id="hudFruit"/);
  // the scene lives on its own, and any input takes over
  assert.match(html, /function ambientTick/);
  assert.match(html, /function controlTick/);
  assert.match(html, /> 10000\) setMode\('ambient'\)/);
  // no external scripts or build step; the only network media is the music deck
  assert.doesNotMatch(html, /<script[^>]+src=/);
  assert.doesNotMatch(html, /<link[^>]+href="http/);
});

test('valley has one parametric renderer for presets and custom characters', async () => {
  const html = await readFile(new URL('../valley/index.html', import.meta.url), 'utf8');

  assert.match(html, /function drawCharacter\(g, def, o\)/);
  for (const name of ['Thomas', '3DVR Girl', 'Mark', 'Esai', 'David', 'Brandon']) {
    assert.match(html, new RegExp(`name:'${name}'`), `preset ${name} missing`);
  }
  // preset looks from the shared brief
  assert.match(html, /beard:true/);
  assert.match(html, /streak:'#57b6ff'/);
  assert.match(html, /hat:'cap'/);
  // creator: same definition shape, saved per browser, deletable
  assert.match(html, /valley\.customs\.v1/);
  assert.match(html, /valley\.selected\.v1/);
  assert.match(html, /function deleteCustom/);
  for (const style of ['short', 'long', 'bun', 'mohawk', 'bald']) {
    assert.match(html, new RegExp(`'${style}'`), `hair style ${style} missing`);
  }
});

test('valley music deck has persistent mute, volume, stations, and a YouTube slot', async () => {
  const html = await readFile(new URL('../valley/index.html', import.meta.url), 'utf8');

  assert.match(html, /id="deckAudio"/);
  assert.match(html, /id="muteBtn"/);
  assert.match(html, /id="volSlider"/);
  assert.match(html, /id="stationSel"/);
  assert.match(html, /valley\.music\.v1/);
  for (const station of ['groovesalad', 'dronezone', 'lush', 'secretagent', 'deepspaceone']) {
    assert.match(html, new RegExp(`ice1\\.somafm\\.com/${station}-128-mp3`), `station ${station} missing`);
  }
  assert.match(html, /youtube-nocookie\.com\/embed\//);
});

test('valley canvas captures the pointer', async () => {
  const html = await readFile(new URL('../valley/index.html', import.meta.url), 'utf8');

  // a drag keeps tracking off the canvas edge instead of stranding
  // the walk target; capture releases on up / cancel
  assert.match(html, /canvas\.setPointerCapture\(e\.pointerId\)/);
  assert.match(html, /canvas#scene\{[^}]*touch-action:none/);
  // no context menu on a long press
  assert.match(html, /addEventListener\('contextmenu', e => e\.preventDefault\(\)\)/);
  // thematic cursor over the canvas: an inline SVG sprout, plain fallback
  assert.match(html, /canvas#scene\{[^}]*cursor:url\("data:image\/svg\+xml/);
  // after ~2 s without pointer movement the cursor hides; the next
  // move or press restores it instantly (class swap, no transition)
  assert.match(html, /canvas#scene\.cursor-idle\{cursor:none\}/);
  assert.match(html, /function wakeCursor\(\)/);
  assert.match(html, /setTimeout\(\(\) => canvas\.classList\.add\('cursor-idle'\), 2000\)/);
  assert.match(html, /canvas\.addEventListener\('pointermove', wakeCursor\)/);
  assert.match(html, /canvas\.addEventListener\('pointerdown', wakeCursor\)/);
});

test('valley mouse buttons: left strolls, right hops, wheel zooms', async () => {
  const html = await readFile(new URL('../valley/index.html', import.meta.url), 'utf8');

  assert.match(html, /e\.pointerType === 'mouse' && e\.button === 2\) \{ jump\(\); return; \}/);
  assert.match(html, /walkTarget = clamp\(camX \+ e\.clientX \/ zoomF, 26, WORLD_W - 26\)/);
  assert.match(html, /addEventListener\('wheel', e => \{\n  e\.preventDefault\(\);/);
  assert.match(html, /zoomF = Math\.max\(0\.7, Math\.min\(2\.2, zoomF/);
  // the world layer scales around the ground line and restores after
  assert.match(html, /ctx\.translate\(0, groundBase\(\) \* \(1 - zoomF\)\);/);
  assert.match(html, /right-click to hop/);
});

test('games hub links the combined 3DVR World card, not standalone modes', async () => {
  const games = await readFile(new URL('../games.html', import.meta.url), 'utf8');
  assert.match(games, /class="game-card world" href="\/3dvr-world\/"/);
  assert.match(games, /\.game-card\.world/);
  assert.doesNotMatch(games, /game-card valley/);
  assert.doesNotMatch(games, /game-card preserve/);
  assert.doesNotMatch(games, /game-card companion/);
});

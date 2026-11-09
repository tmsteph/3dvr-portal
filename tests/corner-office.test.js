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

test('corner office ships a dependency-free office mode', async () => {
  const appDir = new URL('../corner-office/', import.meta.url);
  assert.equal(await fileExists(new URL('index.html', appDir)), true);

  const html = await readFile(new URL('index.html', appDir), 'utf8');

  assert.match(html, /<title>Corner Office — Office Mode<\/title>/);
  assert.match(html, /<canvas id="stage"/);
  assert.match(html, /id="reminderChip"/);
  assert.match(html, /id="deliverChip"/);
  // silent by design: no audio elements, no external scripts or build step
  assert.doesNotMatch(html, /<audio/);
  assert.doesNotMatch(html, /<script[^>]+src=/);
  assert.doesNotMatch(html, /<link[^>]+href="http/);
});

test('corner office is mouse-first with an ambient fallback', async () => {
  const html = await readFile(new URL('../corner-office/index.html', import.meta.url), 'utf8');

  // click / tap to move is the primary control; keys are the alternative
  assert.match(html, /canvas\.addEventListener\('pointerdown'/);
  assert.match(html, /player\.route = routeTo\(player, dest\.x, dest\.y\)/);
  assert.match(html, /addEventListener\('keydown'/);
  // leave it alone for ten seconds and the character gets on with their day
  assert.match(html, /now - lastInputAt > 10000/);
});

test('corner office wears the shared crew in suits', async () => {
  const html = await readFile(new URL('../corner-office/index.html', import.meta.url), 'utf8');

  assert.match(html, /function drawSuited\(g, def, x, y, pose\)/);
  for (const name of ['Thomas', '3DVR Girl', 'Mark', 'Esai', 'David', 'Brandon']) {
    assert.match(html, new RegExp(`name: '${name}'`), `preset ${name} missing`);
  }
  // the shared character spec: same definition shape as the other modes,
  // with office-only suit fields riding on the same object
  assert.match(html, /suit: '#2e3d55'/);
  assert.match(html, /shirtC:/);
  assert.match(html, /tie:/);
  // per-mode keys, kept in sync with the sibling modes' real stores so a
  // character created in any mode is the same character in this one
  assert.match(html, /corner-office\.customs/);
  assert.match(html, /corner-office\.selectedDef/);
  assert.match(html, /preserve\.customs/);
  assert.match(html, /valley\.customs\.v1/);
  assert.match(html, /companion-quest\.customCharacters\.v1/);
});

test('corner office meeting loop is complete', async () => {
  const html = await readFile(new URL('../corner-office/index.html', import.meta.url), 'utf8');

  assert.match(html, /function startRound\(\)/);
  assert.match(html, /function endRound\(delivered\)/);
  assert.match(html, /Deliverables: /);
  assert.match(html, /Meeting starts in /);
  // coffee boost, boardroom delivery, no harsh fail state
  assert.match(html, /boost = 6/);
  assert.match(html, /BOARDROOM_ZONE/);
  assert.match(html, /started without the full deck/);
});

test('corner office is a mode, not a games-hub card', async () => {
  const games = await readFile(new URL('../games.html', import.meta.url), 'utf8');
  assert.doesNotMatch(games, /corner-office/);
});

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

test('preserve ships a dependency-free side-scrolling wander', async () => {
  const appDir = new URL('../preserve/', import.meta.url);
  assert.equal(await fileExists(new URL('index.html', appDir)), true);

  const html = await readFile(new URL('index.html', appDir), 'utf8');

  assert.match(html, /<title>Preserve · 3DVR<\/title>/);
  assert.match(html, /<canvas id="game"/);
  // no external scripts or build step
  assert.doesNotMatch(html, /<script[^>]+src=/);
  assert.doesNotMatch(html, /<link[^>]+href="http/);
  // the character is the shared one: per-mode store plus the World
  // shell's single shared record
  assert.match(html, /preserve\.customs/);
  assert.match(html, /world\.character\.v1/);
});

test('preserve mouse play: every click jumps, holding runs', async () => {
  const html = await readFile(new URL('../preserve/index.html', import.meta.url), 'utf8');

  // the press itself buffers the jump, in every mode but Fly (where a
  // hold rises instead); no timing threshold decides what a click was
  assert.match(html, /if \(gameMode !== 'fly'\) P\.buffer = 0\.12;/);
  assert.doesNotMatch(html, /downAt/);
  assert.doesNotMatch(html, /Quick click/);
  // a press still held at landing runs toward the pointer
  assert.match(html, /if \(mouse\.down && !mouse\.attack\)/);
  // the hint says the rule out loud
  assert.match(html, /click = jump/);
  assert.match(html, /hold = run toward the pointer/);
});

test('preserve canvas captures the pointer', async () => {
  const html = await readFile(new URL('../preserve/index.html', import.meta.url), 'utf8');

  // a hold keeps tracking off the canvas edge (and out of the shell's
  // frame) instead of dying there; capture releases on up / cancel
  assert.match(html, /setPointerCapture\(e\.pointerId\)/);
  assert.match(html, /canvas#game\{[^}]*touch-action:none/);
  // no context menu on a long press
  assert.match(html, /addEventListener\('contextmenu', \(e\) => e\.preventDefault\(\)\)/);
  // the touch buttons capture too, so a held direction cannot strand
  assert.match(html, /btn\.setPointerCapture\(e\.pointerId\)/);
});

test('preserve cursor wears a leaf and fades when idle', async () => {
  const html = await readFile(new URL('../preserve/index.html', import.meta.url), 'utf8');

  // thematic cursor over the canvas: an inline SVG leaf, plain fallback
  assert.match(html, /canvas#game\{[^}]*cursor:url\("data:image\/svg\+xml/);
  assert.match(html, /, auto\}/);
  // after ~2 s without pointer movement the cursor hides; the next
  // move or press restores it instantly (class swap, no transition)
  assert.match(html, /canvas#game\.cursor-idle\{cursor:none\}/);
  assert.match(html, /function wakeCursor\(\)/);
  assert.match(html, /setTimeout\(\(\) => gameCanvas\.classList\.add\('cursor-idle'\), 2000\)/);
  assert.match(html, /gameCanvas\.addEventListener\('pointermove', wakeCursor\)/);
  assert.match(html, /gameCanvas\.addEventListener\('pointerdown', wakeCursor\)/);
});

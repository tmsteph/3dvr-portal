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

test('preserve mouse play: left holds to run, right jumps, touch taps jump', async () => {
  const html = await readFile(new URL('../preserve/index.html', import.meta.url), 'utf8');

  // desktop split (Thomas, 2026-11-09): the RIGHT button buffers the
  // jump, even mid-run; a mouse left press never does; no timing
  // threshold decides what a click was
  assert.match(html, /!touchPress && e\.button === 2\) \{ if \(gameMode !== 'fly'\) P\.buffer = 0\.12; return; \}/);
  assert.match(html, /touchPress && gameMode !== 'fly'\) P\.buffer = 0\.12;/);
  assert.doesNotMatch(html, /downAt/);
  assert.doesNotMatch(html, /Quick click/);
  // releasing the right button must not end a left hold
  assert.match(html, /e\.pointerType === 'mouse' && e\.button !== 0\) return; mouse\.down = false;/);
  // a press still held at landing runs toward the pointer
  assert.match(html, /if \(mouse\.down && !mouse\.attack\)/);
  // the hint says the new rule out loud
  assert.match(html, /hold left-click = run/);
  assert.match(html, /right-click = jump/);
  assert.match(html, /wheel = zoom/);
  assert.doesNotMatch(html, /click = jump · hold = run/);
});

test('preserve wheel zooms the camera, clamped', async () => {
  const html = await readFile(new URL('../preserve/index.html', import.meta.url), 'utf8');

  assert.match(html, /addEventListener\('wheel', \(e\) => \{\n  e\.preventDefault\(\);/);
  assert.match(html, /zoomF = Math\.max\(0\.6, Math\.min\(2\.4, zoomF/);
  // the view width and the render scale both follow zoomF
  assert.match(html, /function applyView\(\) \{ viewW = innerWidth \/ \(innerHeight \/ VH\) \/ zoomF; \}/);
  assert.match(html, /ctx\.setTransform\(SCALE \* zoomF, 0, 0, SCALE \* zoomF, 0, cv\.height - VH \* SCALE \* zoomF\)/);
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

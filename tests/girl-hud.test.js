import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('the world page wears the HUD shell: frame, roster rail, stage select', async () => {
  const [html, hud] = await Promise.all([
    read('3dvr-girl/index.html'),
    read('3dvr-girl/hud.js')
  ]);
  assert.match(html, /<body class="hud">/);
  assert.match(html, /class="hud-stage"/);
  assert.match(html, /id="hudRail"/);
  // Stage select is a game menu in the header: World, Archive,
  // Golden hour, After dark.
  for (const stage of ['world', 'archive', 'goldenhour', 'afterdark']) {
    assert.match(html, new RegExp(`data-stage-tab="${stage}"`), `stage tab ${stage}`);
  }
  assert.match(html, /<script type="module" src="hud\.js"><\/script>/);
  // The roster rail is character select, built from the cast data:
  // her chip loads her own site into the same shell.
  assert.match(hud, /from '\.\/characters\.js'/);
  assert.match(hud, /character\/\?c=/);
  assert.match(hud, /hud-chip/);
});

test('world page sections are grouped into stages in shelf order', async () => {
  const html = await read('3dvr-girl/index.html');
  const stageOf = id => {
    const at = html.indexOf(`id="${id}"`);
    assert.ok(at > -1, `${id} section exists`);
    const tagAt = html.lastIndexOf('<section', at);
    const tag = html.slice(tagAt, html.indexOf('>', tagAt));
    return /data-stage="([a-z]+)"/.exec(tag)?.[1];
  };
  assert.equal(stageOf('archive'), 'archive');
  assert.equal(stageOf('golden-hour'), 'goldenhour');
  assert.equal(stageOf('after-dark'), 'afterdark');
  assert.equal(stageOf('worlds'), 'world');
  // Without hud.js every data-stage section simply shows: the module
  // is what hides the groups, the markup carries no hidden sections.
  const hudAt = html.indexOf('src="hud.js"');
  const beforeHud = html.slice(0, hudAt);
  assert.equal(/<section[^>]*data-stage="[a-z]+"[^>]*hidden/.test(beforeHud), false,
    'sections must not ship hidden; hud.js does the hiding');
});

test('character pages wear the same HUD shell with a roster rail', async () => {
  const [html, app, css] = await Promise.all([
    read('3dvr-girl/character/index.html'),
    read('3dvr-girl/character/app.js'),
    read('3dvr-girl/character/styles.css')
  ]);
  assert.match(html, /<body class="hud">/);
  assert.match(html, /class="hud-stage"/);
  assert.match(html, /id="characterRail"/);
  // The rail replaces the old text switcher and is built from the
  // same cast data as the rest of the page.
  assert.equal(html.includes('characterSwitcher'), false);
  assert.match(app, /characterRail/);
  assert.match(app, /hud-chip/);
  assert.match(app, /entry\.heroImage\.src/);
  assert.match(css, /\.hud-rail \{/);
  assert.match(css, /\.hud-stage \{[^}]*overflow-y: auto/);
});

test('the stage is the scroller: reveals listen on the document, not the window', async () => {
  const [app, gallery, characterApp, css] = await Promise.all([
    read('3dvr-girl/app.js'),
    read('3dvr-girl/gallery.js'),
    read('3dvr-girl/character/app.js'),
    read('3dvr-girl/styles.css')
  ]);
  // The page no longer scrolls, so a window scroll listener would
  // never fire inside the stage. Capturing document listeners hear
  // scrolls from the window and from the stage panel alike.
  for (const [name, source] of [['app.js', app], ['gallery.js', gallery], ['character/app.js', characterApp]]) {
    assert.match(source, /document\.addEventListener\('scroll'[^;]*capture: true/,
      `${name} must hear stage scrolls`);
    assert.equal(/window\.addEventListener\('scroll'/.test(source), false,
      `${name} must not rely on window scroll alone`);
  }
  assert.match(css, /\.hud-stage \{[^}]*overflow-y: auto/);
  assert.match(css, /body\.hud \{[^}]*overflow: hidden/);
});

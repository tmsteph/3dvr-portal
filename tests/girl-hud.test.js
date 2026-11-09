import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

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

test('viewer.js is the shared viewer engine, loaded before both viewers', async () => {
  const [worldHtml, characterHtml, viewer] = await Promise.all([
    read('3dvr-girl/index.html'),
    read('3dvr-girl/character/index.html'),
    read('3dvr-girl/viewer.js')
  ]);
  assert.match(viewer, /window\.LadiesViewer = \{ attachZoom, searchItems, mountChrome \}/);
  assert.match(viewer, /attachZoom/);
  assert.match(viewer, /dblclick/);
  assert.match(viewer, /mountChrome/);
  assert.match(viewer, /searchItems/);
  // The world page loads it ahead of gallery.js, the character page
  // ahead of its module app.
  const viewerAt = worldHtml.indexOf('<script src="viewer.js"></script>');
  assert.ok(viewerAt > -1, 'world page loads viewer.js');
  assert.ok(viewerAt < worldHtml.indexOf('<script src="gallery.js"></script>'),
    'viewer.js loads before gallery.js');
  assert.match(characterHtml, /<script defer src="\.\.\/viewer\.js"><\/script>/);
});

test('picture search matches every word across label, alt, copy and search text', async () => {
  const code = await read('3dvr-girl/viewer.js');
  const sandbox = { window: {} };
  runInNewContext(code, sandbox);
  const { searchItems } = sandbox.window.LadiesViewer;
  const items = [
    { label: 'Water · Pool rules', alt: 'Kayla laughing beside a sunlit pool', copy: 'Turquoise water, black bikini' },
    { label: 'Forest · Trail portrait', alt: 'Kayla on a forest trail', copy: 'Compass on her straps', search: 'Kayla' },
    { label: 'Sun · Lavender twirl', alt: '3DVR Girl twirling in a lavender field', copy: 'A white linen sundress' }
  ];
  // Results come from the vm realm, so compare by label, not by ref.
  const labels = found => found.map(item => item.label).join(' | ');
  assert.equal(labels(searchItems(items, 'kayla pool')), 'Water · Pool rules');
  assert.equal(labels(searchItems(items, 'KAYLA')), 'Water · Pool rules | Forest · Trail portrait');
  assert.equal(labels(searchItems(items, 'lavender linen')), 'Sun · Lavender twirl');
  assert.equal(searchItems(items, '').length, 0);
  assert.equal(searchItems(items, 'snow').length, 0);
});

test('the world viewer takes zoom, section jumps and search from viewer.js', async () => {
  const [app, gallery] = await Promise.all([
    read('3dvr-girl/app.js'),
    read('3dvr-girl/gallery.js')
  ]);
  assert.match(gallery, /LadiesViewer\.attachZoom/);
  assert.match(gallery, /LadiesViewer\.mountChrome/);
  assert.match(gallery, /LadiesViewer\.searchItems/);
  // The catalogue the bar and search browse is published by app.js.
  assert.match(app, /window\.LadiesGalleryData = \{/);
  assert.match(app, /, 'archive'\)/);
  assert.match(app, /, 'goldenhour'\)/);
  // Arrow keys step the picture, never the search box.
  assert.match(gallery, /matches\?\.\('input, textarea, select'\)/);
});

test('the world viewer never surfaces After dark while the curtain is shut', async () => {
  const gallery = await read('3dvr-girl/gallery.js');
  // After dark joins the sections locked unless the curtain check
  // passes, its pictures come only from the open branch, search
  // skips locked sections, and picking the locked section hands
  // back to the stage, which shows the curtain.
  assert.match(gallery, /locked: !open/);
  assert.match(gallery, /items: open \? cards\.map/);
  assert.match(gallery, /if \(section\.locked \|\| !section\.items\?\.length\) continue;/);
  assert.match(gallery, /LadiesHud\?\.activateStage\('afterdark'\)/);
});

test('the character lightbox takes zoom, section jumps and search from viewer.js', async () => {
  const [app, css, worldCss] = await Promise.all([
    read('3dvr-girl/character/app.js'),
    read('3dvr-girl/character/styles.css'),
    read('3dvr-girl/styles.css')
  ]);
  assert.match(app, /LadiesViewer\.attachZoom/);
  assert.match(app, /LadiesViewer\.mountChrome/);
  assert.match(app, /LadiesViewer\.searchItems/);
  assert.match(app, /matches\?\.\('input, textarea, select'\)/);
  // Her private frames join in only while her curtain is open, and
  // the locked pick closes onto her After dark tab.
  assert.match(app, /locked: !afterDarkState\.open/);
  assert.match(app, /if \(section\.locked \|\| !section\.items\?\.length\) continue;/);
  assert.match(app, /activateTab\('afterdark', \{ scroll: true \}\)/);
  // The lightbox image takes gestures itself, and both pages style
  // the in-viewer chrome the module builds.
  assert.match(css, /\.gallery-dialog__figure img \{\s*touch-action: none;/);
  assert.match(css, /\.viewer-bar \{/);
  assert.match(css, /\.viewer-search \{/);
  assert.match(worldCss, /\.viewer-bar \{/);
  assert.match(worldCss, /\.viewer-search \{/);
});

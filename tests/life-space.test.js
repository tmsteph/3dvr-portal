import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../life-space/index.html', import.meta.url), 'utf8');
const js = fs.readFileSync(new URL('../life-space/app.js', import.meta.url), 'utf8');
const storage = fs.readFileSync(new URL('../life-space/storage.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../life-space/styles.css', import.meta.url), 'utf8');
const sync = fs.readFileSync(new URL('../life-space/sync.js', import.meta.url), 'utf8');

test('Life Space exposes every core capture type', () => {
  for (const type of ['note','checklist','link','image','file']) assert.match(html, new RegExp(`data-add="${type}"`));
  assert.match(html, /id="draw-tool"/);
});

test('Life Space is local-first and supports portable backups', () => {
  assert.match(storage, /indexedDB\.open/);
  assert.match(storage, /exportWorkspace/);
  assert.match(storage, /importWorkspace/);
  assert.match(storage, /3dvr-life-space/);
});

test('Life Space loads encrypted portal-account sync without giving up offline storage', () => {
  assert.match(html, /gun\/sea\.js/);
  assert.match(html, /auth-identity\.js/);
  assert.match(js, /createLifeSpaceSync/);
  assert.match(sync, /SEA\.encrypt/);
  assert.match(sync, /CHUNK_SIZE/);
  assert.match(sync, /Synced to your account/);
});

test('Life Space implements spatial interaction and history', () => {
  assert.match(js, /type:'drag'/);
  assert.match(js, /type:'resize'/);
  assert.match(js, /type:'pan'/);
  assert.match(js, /setZoom/);
  assert.match(js, /function travel/);
});

test('Life Space raises tapped or header-dragged cards and continuously pans from the card body', () => {
  assert.match(js, /function bringItemToFront/);
  assert.match(js, /item\.z >= 1000000/);
  assert.match(js, /card\.style\.zIndex = bringItemToFront\(item\)/);
  assert.match(js, /interaction\.card\.style\.zIndex = bringItemToFront\(interaction\.item\)/);
  assert.match(js, /type:'card-pan'/);
  assert.match(js, /moved:false/);
  assert.match(js, /if \(!interaction\.moved && Math\.hypot\(dx, dy\) < 8\) return/);
  assert.match(js, /view\.x = interaction\.x \+ dx/);
  assert.match(js, /view\.y = interaction\.y \+ dy/);
  assert.doesNotMatch(js, /if \(card\) \{\s*const selected = itemById/);
});

test('Life Space provides responsive mobile controls', () => {
  assert.match(html, /viewport-fit=cover/);
  assert.match(html, /interactive-widget=overlays-content/);
  assert.match(css, /@media\(max-width:760px\)/);
  assert.match(css, /safe-area-inset-bottom/);
  assert.match(css, /\.app-shell,\.workspace\{height:100vh;height:100lvh\}/);
  assert.match(css, /touch-action:none/);
  assert.match(html, /life-space\.webmanifest/);
});

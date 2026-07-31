import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../life-space/index.html', import.meta.url), 'utf8');
const js = fs.readFileSync(new URL('../life-space/app.js', import.meta.url), 'utf8');
const storage = fs.readFileSync(new URL('../life-space/storage.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../life-space/styles.css', import.meta.url), 'utf8');

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

test('Life Space implements spatial interaction and history', () => {
  assert.match(js, /type:'drag'/);
  assert.match(js, /type:'resize'/);
  assert.match(js, /type:'pan'/);
  assert.match(js, /setZoom/);
  assert.match(js, /function travel/);
});

test('Life Space provides responsive mobile controls', () => {
  assert.match(html, /viewport-fit=cover/);
  assert.match(css, /@media\(max-width:760px\)/);
  assert.match(css, /safe-area-inset-bottom/);
  assert.match(css, /touch-action:none/);
  assert.match(html, /life-space\.webmanifest/);
});

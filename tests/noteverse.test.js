import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Noteverse ships a real 3D Life Space workspace', async () => {
  const [html, css, app, lifeSpace, appSearch] = await Promise.all([
    read('noteverse/index.html'),
    read('noteverse/styles.css'),
    read('noteverse/app.js'),
    read('life-space/index.html'),
    read('operator/app-search.js')
  ]);

  assert.match(html, /<title>Noteverse · 3DVR<\/title>/);
  assert.match(html, /id="noteverse-canvas"/);
  assert.match(html, /id="new-note"/);
  assert.match(css, /\.workspace/);

  assert.match(app, /three@0\.165\.0\/build\/three\.module\.js/);
  assert.match(app, /new THREE\.WebGLRenderer/);
  assert.match(app, /\.\.\/life-space\/storage\.js/);
  assert.match(app, /createLifeSpaceSync/);
  assert.match(app, /exportWorkspace/);
  assert.match(app, /noteversePosition/);

  assert.match(lifeSpace, /href="\/noteverse\/"/);
  assert.match(appSearch, /title: 'Noteverse'/);
  assert.match(appSearch, /href: '\/noteverse\/'/);
});

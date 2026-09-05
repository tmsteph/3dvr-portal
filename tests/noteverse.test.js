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
  assert.match(html, /id="motion-look"/);
  assert.match(html, /id="sun-menu"/);
  assert.match(html, /id="editor-panel"/);
  assert.doesNotMatch(html, /<footer>/);
  assert.doesNotMatch(html, /class="controls"/);
  assert.match(css, /\.stage-wrap/);
  assert.match(css, /body \{ margin: 0; overflow: hidden/);
  assert.match(css, /\.panel\[hidden\]/);

  assert.match(app, /three@0\.165\.0\/build\/three\.module\.js/);
  assert.match(app, /new THREE\.WebGLRenderer/);
  assert.match(app, /\.\.\/life-space\/storage\.js/);
  assert.match(app, /createLifeSpaceSync/);
  assert.match(app, /exportWorkspace/);
  assert.match(app, /noteversePosition/);
  assert.match(app, /function panCamera/);
  assert.match(app, /function dollyCamera/);
  assert.match(app, /requestPermission/);
  assert.match(app, /deviceorientation/);
  assert.match(app, /event\.pointerType === 'touch' \? -1 : 1/);
  assert.match(app, /dollyCamera\(delta \* 0\.025\)/);
  assert.match(app, /motionYaw = angleDeltaDegrees/);
  assert.match(app, /motionPitch = Math\.max/);
  assert.match(app, /sunTarget/);
  assert.match(app, /userData\.isSun/);
  assert.match(app, /setSunMenu/);
  assert.match(app, /sunLight\.intensity/);
  assert.doesNotMatch(app, /radius \+= Math\.sign/);

  assert.match(lifeSpace, /href="\/noteverse\/"/);
  assert.match(appSearch, /title: 'Noteverse'/);
  assert.match(appSearch, /href: '\/noteverse\/'/);
});

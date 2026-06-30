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

test('string theory visualizer ships a Three.js learning route', async () => {
  const appDir = new URL('../string-theory/', import.meta.url);
  assert.equal(await fileExists(new URL('index.html', appDir)), true);
  assert.equal(await fileExists(new URL('styles.css', appDir)), true);
  assert.equal(await fileExists(new URL('app.js', appDir)), true);

  const html = await readFile(new URL('index.html', appDir), 'utf8');
  const css = await readFile(new URL('styles.css', appDir), 'utf8');
  const app = await readFile(new URL('app.js', appDir), 'utf8');
  const portal = await readFile(new URL('../index.html', import.meta.url), 'utf8');

  assert.match(html, /String Theory Visualizer \| 3DVR Portal/);
  assert.match(html, /id="string-canvas"/);
  assert.match(html, /id="mode"/);
  assert.match(html, /Open string/);
  assert.match(html, /Closed loop/);
  assert.match(html, /Brane wave/);
  assert.match(html, /Compact dimension/);

  assert.match(css, /#string-canvas/);
  assert.match(css, /position:\s*fixed/);
  assert.match(css, /touch-action:\s*none/);
  assert.match(css, /@media \(max-width: 720px\)/);

  assert.match(app, /three@0\.165\.0\/build\/three\.module\.js/);
  assert.match(app, /new THREE\.WebGLRenderer/);
  assert.match(app, /createBrane/);
  assert.match(app, /createCompactDimension/);
  assert.match(app, /updateString/);
  assert.match(app, /window\.StringTheoryVisualizer/);

  assert.match(portal, /href="string-theory\/"/);
  assert.match(portal, /String Theory Visualizer/);
  assert.match(portal, /id: 'string-theory'/);
  assert.match(portal, /String Theory Visualizer',/);
});

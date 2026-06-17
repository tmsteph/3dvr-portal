import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('fractal explorer ships a browser-based Three.js fractal navigator', async () => {
  const html = await readFile(new URL('../fractal-explorer/index.html', import.meta.url), 'utf8');
  const app = await readFile(new URL('../fractal-explorer/app.js', import.meta.url), 'utf8');
  const portal = await readFile(new URL('../index.html', import.meta.url), 'utf8');

  assert.match(html, /Fractal Explorer/);
  assert.match(html, /id="fractal-canvas"/);
  assert.match(html, /id="copy-link"/);
  assert.match(html, /id="power"/);
  assert.match(html, /id="palette"/);

  assert.match(app, /three@0\.165\.0\/build\/three\.module\.js/);
  assert.match(app, /float mandelbulbDE/);
  assert.match(app, /new THREE\.WebGLRenderer/);
  assert.match(app, /window\.history\.replaceState/);
  assert.match(app, /navigator\.clipboard\.writeText/);

  assert.match(portal, /href="fractal-explorer\/"/);
  assert.match(portal, /Fractal Explorer/);
});

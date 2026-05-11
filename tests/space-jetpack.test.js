import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

describe('space jetpack game route', () => {
  it('adds a standalone Three.js space jetpack game', async () => {
    const html = await readFile(new URL('../space-jetpack/index.html', import.meta.url), 'utf8');
    const js = await readFile(new URL('../space-jetpack/main.js', import.meta.url), 'utf8');
    const css = await readFile(new URL('../space-jetpack/style.css', import.meta.url), 'utf8');
    const hub = await readFile(new URL('../games.html', import.meta.url), 'utf8');

    assert.match(html, /3DVR Space Jetpack/);
    assert.match(html, /giant 3dvr\.tech logo/);
    assert.match(html, /shoot-btn/);
    assert.match(html, /data-control="up"/);
    assert.match(html, /data-control="down"/);
    assert.match(html, /data-look="left"/);
    assert.match(html, /id="overlay" hidden/);
    assert.match(html, /cdnjs\.cloudflare\.com\/ajax\/libs\/three\.js\/r128\/three\.min\.js/);
    assert.match(html, /type="module" src="main\.js"/);
    assert.match(js, /createInputController/);
    assert.match(js, /createDestructibleLogo/);
    assert.match(js, /const word = '3dvr\.tech'/);
    assert.match(js, /const vertical = Number\(controls\.up\) - Number\(controls\.down\)/);
    assert.match(js, /startGame\(\);/);
    assert.match(js, /player\.velocity\.multiplyScalar\(0\.965\)/);
    assert.match(js, /createAsteroids/);
    assert.match(js, /createCoinTrails/);
    assert.match(js, /Raycaster/);
    assert.match(js, /createCanvasFallbackRenderer/);
    assert.match(js, /dataset\.webglFallback/);
    assert.match(js, /logoBlock/);
    assert.match(js, /asteroid/);
    assert.match(css, /\.control-pad__grid/);
    assert.match(css, /\.control-btn\.shoot/);
    assert.match(hub, /space-jetpack\//);
    assert.doesNotMatch(js, /GLTFLoader/);
  });
});

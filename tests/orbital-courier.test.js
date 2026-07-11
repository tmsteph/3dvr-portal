import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

describe('Orbital Courier game route', () => {
  it('adds a standalone spherical delivery game to the games hub', async () => {
    const html = await readFile(new URL('../orbital-courier/index.html', import.meta.url), 'utf8');
    const js = await readFile(new URL('../orbital-courier/main.js', import.meta.url), 'utf8');
    const css = await readFile(new URL('../orbital-courier/style.css', import.meta.url), 'utf8');
    const hub = await readFile(new URL('../games.html', import.meta.url), 'utf8');

    assert.match(html, /Orbital Courier/);
    assert.match(html, /id="game-canvas"/);
    assert.match(html, /id="start-button"/);
    assert.match(html, /id="pause-button"/);
    assert.match(html, /id="reset-button"/);
    assert.match(html, /id="target-arrow"/);
    assert.match(html, /id="target-distance"/);
    assert.match(html, /data-touch-pad/);
    assert.match(html, /id="boost-button"/);
    assert.match(html, /cdnjs\.cloudflare\.com\/ajax\/libs\/three\.js\/r128\/three\.min\.js/);
    assert.match(html, /type="module" src="main\.js"/);
    assert.doesNotMatch(html, /messenger\.abeto\.co/i);

    assert.match(js, /new THREE\.WebGLRenderer/);
    assert.match(js, /new THREE\.SphereGeometry\(PLANET_RADIUS/);
    assert.match(js, /normalFromLatLon/);
    assert.match(js, /spawnRoute/);
    assert.match(js, /surfaceDistance/);
    assert.match(js, /PLANET_RADIUS = 32/);
    assert.match(js, /addScaledVector\(player\.normal, 7\.5\)/);
    assert.match(js, /addScaledVector\(heading, -12\.5\)/);
    assert.doesNotMatch(js, /PLANET_RADIUS \+ 82/);
    assert.match(js, /CylinderGeometry\(0\.3, 0\.7, 4\.4/);
    assert.match(js, /RUN_LENGTH_SECONDS = 150/);
    assert.match(js, /updateRouteGuide/);
    assert.match(js, /Beacon in range/);
    assert.match(js, /requestAnimationFrame\(animate\)/);
    assert.match(js, /addEventListener\('pointerdown'/);
    assert.match(js, /window\.OrbitalCourier/);
    assert.doesNotMatch(js, /messenger\.abeto\.co/i);

    assert.match(css, /#game-canvas/);
    assert.match(css, /\.touch-pad/);
    assert.match(css, /\.instruction-chip/);
    assert.match(css, /\.route-guide__arrow/);
    assert.match(css, /@media \(hover: none\), \(pointer: coarse\)/);

    assert.match(hub, /class="game-card courier"/);
    assert.match(hub, /href="orbital-courier\/"/);
    assert.match(hub, /<span class="game-title">Orbital Courier<\/span>/);
  });
});

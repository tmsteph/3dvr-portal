import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const pageUrl = new URL('../sky-room/index.html', import.meta.url);
const indexUrl = new URL('../index.html', import.meta.url);

describe('sky room page', () => {
  it('ships an outdoor scene with live time and manual controls', async () => {
    const html = await readFile(pageUrl, 'utf8');
    assert.match(html, /Sky Room/);
    assert.match(html, /timeSlider/);
    assert.match(html, /Use live time/);
    assert.match(html, /Golden hour/);
    assert.match(html, /fullscreenButton/);
    const app = await readFile(new URL('../sky-room/app.js', import.meta.url), 'utf8');
    assert.match(app, /requestFullscreen/);
    assert.match(app, /Math\.pow\(1 - day, 1\.7\)/);
    assert.match(app, /function drawCelestialSky\(w, h, day, date\)/);
    assert.match(app, /constellationLines/);
    assert.match(app, /const moonAge = date =>/);
    assert.match(app, /x = 50 - Math\.cos\(angle\) \* 42/);
    assert.match(app, /function twilightWarmth\(m\)/);
    assert.match(app, /rgba\(255, 105, 48/);
    assert.match(html, /locationButton/);
    assert.match(app, /api\.open-meteo\.com\/v1\/forecast/);
    assert.match(app, /seasonFor/);
    assert.match(app, /drawWildlife/);
    assert.match(app, /biomeFor/);
    assert.match(app, /drawAnimal/);
    assert.match(app, /Tropical forest/);
    assert.match(app, /Boreal forest/);
    assert.match(app, /region adapts when location is on/);
    assert.match(html, /biomeSelect/);
    assert.match(html, /Automatic for my location/);
    assert.match(app, /biomeMode/);
    assert.match(app, /updateBiomeLabel/);
    assert.match(app, /FULLSCREEN_IDLE_MS = 4000/);
    assert.match(app, /fullscreen-idle/);
    assert.match(app, /sceneCard\.addEventListener\('pointermove'/);
    assert.match(app, /sceneCard\.addEventListener\('pointerdown'/);
    assert.match(app, /sceneCard\.addEventListener\('keydown'/);
  });
  it('links the page from the portal app dock', async () => {
    const html = await readFile(indexUrl, 'utf8');
    assert.match(html, /href="sky-room\/"/);
    assert.match(html, /<span class="app-card__title">Sky Room<\/span>/);
  });
});

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
    assert.match(app, /Stars belong to the dark sky/);
    assert.match(app, /function twilightWarmth\(m\)/);
    assert.match(app, /rgba\(255, 105, 48/);
    assert.match(html, /locationButton/);
    assert.match(app, /api\.open-meteo\.com\/v1\/forecast/);
    assert.match(app, /seasonFor/);
    assert.match(app, /drawWildlife/);
  });
  it('links the page from the portal app dock', async () => {
    const html = await readFile(indexUrl, 'utf8');
    assert.match(html, /href="sky-room\/"/);
    assert.match(html, /<span class="app-card__title">Sky Room<\/span>/);
  });
});

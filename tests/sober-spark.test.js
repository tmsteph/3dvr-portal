import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const pageUrl = new URL('../sober-spark/index.html', import.meta.url);
const indexUrl = new URL('../index.html', import.meta.url);

describe('Sober Spark app', () => {
  it('ships the expanded sober stimulation modes and highlighted portal backlink', async () => {
    const html = await readFile(pageUrl, 'utf8');

    assert.match(html, /Back to 3DVR Portal/);
    assert.match(html, /class="portal-link"/);
    assert.match(html, /Weed tunnel/);
    assert.match(html, /Mushroom drift/);
    assert.match(html, /LSD geometry/);
    assert.match(html, /DMT flash/);
    assert.match(html, /Alcohol wobble/);
  });

  it('prevents text selection and captures right-click interaction on the canvas', async () => {
    const html = await readFile(pageUrl, 'utf8');

    assert.match(html, /user-select: none/);
    assert.match(html, /-webkit-user-select: none/);
    assert.match(html, /function captureField\(event\)/);
    assert.match(html, /event\.button !== undefined && event\.button !== 2/);
    assert.match(html, /canvas\.setPointerCapture/);
    assert.match(html, /canvas\.addEventListener\("pointerdown", handlePointerDown\)/);
    assert.match(html, /canvas\.addEventListener\("contextmenu", \(event\) => event\.preventDefault\(\)\)/);
    assert.match(html, /selectstart", \(event\) => event\.preventDefault\(\)/);
  });

  it('supports keyboard, wheel, and two-finger navigation controls', async () => {
    const html = await readFile(pageUrl, 'utf8');

    assert.match(html, /const keys = new Set\(\)/);
    assert.match(html, /function updateNavigation\(dt\)/);
    assert.match(html, /keys\.has\("w"\)/);
    assert.match(html, /keys\.has\("a"\)/);
    assert.match(html, /keys\.has\("s"\)/);
    assert.match(html, /keys\.has\("d"\)/);
    assert.match(html, /if \(key === "w"\) camera\.y -= 92/);
    assert.match(html, /if \(key === "s"\) camera\.y \+= 92/);
    assert.match(html, /if \(key === "a"\) camera\.x -= 92/);
    assert.match(html, /if \(key === "d"\) camera\.x \+= 92/);
    assert.match(html, /soundStatus\.textContent = "WASD drift"/);
    assert.match(html, /canvas\.addEventListener\("wheel", handleWheel, \{ passive: false \}\)/);
    assert.match(html, /function handleTouchMove\(event\)/);
    assert.match(html, /gesture\.lastDistance/);
    assert.match(html, /Two-finger flight/);
  });

  it('drops the stimulation meter and adds peak and fullscreen controls', async () => {
    const html = await readFile(pageUrl, 'utf8');

    assert.doesNotMatch(html, /Stimulation level/);
    assert.doesNotMatch(html, /Right-click captures the field\. Drag to steer\./);
    assert.match(html, /id="focusButton">Fullscreen/);
    assert.match(html, /function peakBlast\(\)/);
    assert.match(html, /body\.peak/);
    assert.match(html, /function playKick\(force = 1\)/);
    assert.match(html, /document\.documentElement\.requestFullscreen/);
  });

  it('keeps Sober Spark discoverable from the portal home', async () => {
    const html = await readFile(indexUrl, 'utf8');

    assert.match(html, /href="sober-spark\/"/);
    assert.match(html, /<span class="app-card__title">Sober Spark<\/span>/);
  });
});

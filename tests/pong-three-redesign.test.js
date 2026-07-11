import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

describe('Pong Three.js redesign', () => {
  it('renders with Three.js and keeps score integration', async () => {
    const html = await readFile(new URL('../pong.html', import.meta.url), 'utf8');

    assert.match(html, /three@0\.155\.0\/build\/three\.min\.js/);
    assert.match(html, /new THREE\.WebGLRenderer\(\{ antialias: true, alpha: true \}\)/);
    assert.match(html, /supportsWebGL\(\)/);
    assert.match(html, /scoreManager\.increment\(50\)/);
    assert.match(html, /Pong Arena/);
  });

  it('supports left and right as alternate paddle controls', async () => {
    const html = await readFile(new URL('../pong.html', import.meta.url), 'utf8');

    assert.match(html, /'ArrowLeft'/);
    assert.match(html, /'ArrowRight'/);
    assert.match(html, /keysDown\.has\('ArrowLeft'\)/);
    assert.match(html, /keysDown\.has\('ArrowRight'\)/);
    assert.match(html, /Left\/Right controls the paddle/);
    assert.match(html, /if \(upward && !downward\) return 1;/);
    assert.match(html, /if \(downward && !upward\) return -1;/);
  });

  it('keeps the AI intentionally beatable', async () => {
    const html = await readFile(new URL('../pong.html', import.meta.url), 'utf8');

    assert.match(html, /const AI_MAX_SPEED = 7\.2;/);
    assert.match(html, /const AI_REACTION_SECONDS = 0\.55;/);
    assert.match(html, /const AI_AIM_ERROR = 2\.8;/);
    assert.match(html, /travelTime \* 0\.42/);
    assert.match(html, /aimNoise/);
    assert.match(html, /aiThinkTimer/);
  });

  it('keeps the arena full-screen without page scrolling', async () => {
    const html = await readFile(new URL('../pong.html', import.meta.url), 'utf8');

    assert.match(html, /\.game-page\s*\{[\s\S]*?height: 100dvh;[\s\S]*?overflow: hidden;/);
    assert.match(html, /\.arena-shell\s*\{[\s\S]*?position: absolute;[\s\S]*?inset: 0;/);
    assert.match(html, /\.arena\s*\{[\s\S]*?width: 100vw;[\s\S]*?height: 100dvh;/);
    assert.match(html, /overscroll-behavior: none;/);
    assert.match(html, /horizontalFitDistance/);
    assert.match(html, /camera\.position\.z = Math\.max\(36, horizontalFitDistance \* 1\.08\);/);
    assert.match(html, /scene\.fog\.far = Math\.max\(48, camera\.position\.z \+ 24\);/);
  });

  it('locks mouse control after clicking the arena', async () => {
    const html = await readFile(new URL('../pong.html', import.meta.url), 'utf8');

    assert.match(html, /requestMouseLock\(\)/);
    assert.match(html, /arena\.requestPointerLock\(\)/);
    assert.match(html, /document\.pointerLockElement === arena/);
    assert.match(html, /movePlayerByPointerDelta\(event\.movementY\)/);
    assert.match(html, /press Esc to release/);
  });
});

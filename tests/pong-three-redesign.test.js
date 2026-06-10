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
    assert.match(html, /Left\/Right controls the player paddle/);
  });

  it('keeps the AI intentionally beatable', async () => {
    const html = await readFile(new URL('../pong.html', import.meta.url), 'utf8');

    assert.match(html, /const AI_MAX_SPEED = 9\.6;/);
    assert.match(html, /const AI_REACTION_SECONDS = 0\.34;/);
    assert.match(html, /const AI_AIM_ERROR = 1\.85;/);
    assert.match(html, /aimNoise/);
    assert.match(html, /aiThinkTimer/);
  });
});

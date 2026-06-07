import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const gameCards = [
  ['pong', 'Pong (2P)'],
  ['memory', 'Memory Match'],
  ['tribes', 'Zero-G Ski Range'],
  ['stellar', 'Stellar Drift Flight'],
  ['jetpack', 'Jetpack Corridor'],
  ['asteroids', 'Space Jetpack: 3DVR Asteroids']
];

describe('games page icons', () => {
  it('gives every game card a themed icon and short blurb', async () => {
    const html = await readFile(new URL('../games.html', import.meta.url), 'utf8');

    assert.match(html, /class="hub-intro"/);
    assert.match(html, /class="game-grid" aria-label="3DVR mini games"/);
    assert.match(html, /\.game-icon svg/);

    for (const [className, title] of gameCards) {
      assert.match(html, new RegExp(`class="game-card ${className}"[\\s\\S]*?<span class="game-icon"`));
      assert.match(html, new RegExp(`<span class="game-title">${title.replace(/[()]/g, '\\$&')}</span>`));
      assert.match(html, new RegExp(`class="game-card ${className}"[\\s\\S]*?<p class="game-blurb">`));
    }
  });
});

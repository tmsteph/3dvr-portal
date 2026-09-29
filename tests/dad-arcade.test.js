import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test("Dad's Arcade ships two playable games with shared controls", async () => {
  const [hub, input, asteroids, centipede] = await Promise.all([
    read('dad-arcade/index.html'),
    read('dad-arcade/input.js'),
    read('dad-arcade/asteroids/index.html'),
    read('dad-arcade/centipede/index.html')
  ]);

  assert.match(hub, /Dad's Arcade/);
  assert.match(hub, /\.\/asteroids\//);
  assert.match(hub, /\.\/centipede\//);
  assert.match(hub, /Pinball Workshop/);

  assert.match(input, /DadArcadeInput/);
  assert.match(input, /data-arcade-action/);
  assert.match(input, /pointer/);

  assert.match(asteroids, /ASTEROIDS/);
  assert.match(asteroids, /function splitRock/);
  assert.match(asteroids, /function spawnWave/);
  assert.match(asteroids, /data-arcade-action="thrust"/);
  assert.match(asteroids, /localStorage\.setItem\('3dvr-dad-arcade-asteroids-high'/);

  assert.match(centipede, /CENTIPEDE/);
  assert.match(centipede, /function moveCentipede/);
  assert.match(centipede, /mushrooms/);
  assert.match(centipede, /spider/);
  assert.match(centipede, /input\.pointer\.active/);
  assert.match(centipede, /localStorage\.setItem\('3dvr-dad-arcade-centipede-high'/);
});

test("Dad's Arcade is discoverable from Labs and Operator search", async () => {
  const [labs, search] = await Promise.all([
    read('labs/index.html'),
    read('operator/app-search.js')
  ]);
  assert.match(labs, /href="\.\.\/dad-arcade\/"/);
  assert.match(search, /href: '\/dad-arcade\/'/);
  assert.match(search, /asteroids centipede arcade dad pinball/);
});

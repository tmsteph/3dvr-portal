import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  advancePlayer,
  clamp,
  collectNearbyNodes,
  computeGardenGrade,
  createGardenNodes,
} from '../signal-garden/game-state.js';

function assertNear(actual, expected, epsilon = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} is not within ${epsilon} of ${expected}`);
}

describe('signal garden helpers', () => {
  it('clamps invalid and out-of-range values', () => {
    assert.equal(clamp(12, 0, 10), 10);
    assert.equal(clamp(-4, 0, 10), 0);
    assert.equal(clamp(Number.NaN, 2, 10), 2);
  });

  it('creates deterministic sparks inside the playable area', () => {
    const nodes = createGardenNodes({
      count: 3,
      width: 300,
      height: 180,
      margin: 20,
      seed: 11,
    });

    assert.equal(nodes.length, 3);
    assertNear(nodes[0].x, 136.19807402249245);
    assertNear(nodes[1].y, 92.4487089388526);
    assert.ok(nodes.every((node) => node.x >= 20 && node.x <= 280));
    assert.ok(nodes.every((node) => node.y >= 20 && node.y <= 160));
  });

  it('collects nearby active sparks and awards combo score', () => {
    const nodes = [
      { id: 'a', x: 50, y: 50, radius: 8, value: 10, active: true },
      { id: 'b', x: 70, y: 50, radius: 8, value: 15, active: true },
      { id: 'c', x: 140, y: 50, radius: 8, value: 20, active: true },
    ];

    const result = collectNearbyNodes({ x: 55, y: 50 }, nodes, {
      collectionRadius: 12,
      time: 2,
      lastCollectTime: 1,
      combo: 1,
    });

    assert.equal(result.collected, 2);
    assert.equal(result.combo, 3);
    assert.equal(result.score, 37);
    assert.equal(result.nodes[0].active, false);
    assert.equal(result.nodes[1].active, false);
    assert.equal(result.nodes[2].active, true);
  });

  it('advances the player with normalized movement and bounds', () => {
    const player = { x: 10, y: 10, radius: 5, speed: 100 };
    const moved = advancePlayer(
      player,
      { up: false, right: true, down: true, left: false, boost: false },
      1,
      { width: 80, height: 80 },
    );

    assertNear(moved.x, 75);
    assertNear(moved.y, 75);
  });

  it('grades the garden by completion and score', () => {
    assert.equal(computeGardenGrade(0, 0, 10), 'Seed');
    assert.equal(computeGardenGrade(80, 4, 10), 'Gathering');
    assert.equal(computeGardenGrade(120, 7, 10), 'Awake');
    assert.equal(computeGardenGrade(180, 10, 10), 'Bloom');
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  addFuel,
  applyDamage,
  clamp,
  computeForwardSpeed,
  computeProgress,
  consumeFuel,
  createTrackPoint,
  generateSpawnPoints,
} from '../jetpack/game-state.js';

function assertNear(actual, expected, epsilon = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} is not within ${epsilon} of ${expected}`);
}

describe('jetpack game-state helpers', () => {
  it('clamps values and handles invalid input', () => {
    assert.equal(clamp(10, 0, 5), 5);
    assert.equal(clamp(-2, 0, 5), 0);
    assert.equal(clamp(3, 0, 5), 3);
    assert.equal(clamp(Number.NaN, 2, 10), 2);
  });

  it('computes progress and forward speed using clamped progress', () => {
    assert.equal(computeProgress(50, 200), 0.25);
    assert.equal(computeProgress(500, 200), 1);
    assert.equal(computeProgress(-20, 200), 0);
    assert.equal(computeProgress(40, 0), 1);

    assert.equal(computeForwardSpeed(10, 5, 0.5), 12.5);
    assert.equal(computeForwardSpeed(10, 5, 2), 15);
  });

  it('updates fuel and shield with proper bounds', () => {
    const idleFuel = consumeFuel(100, 2, {
      isThrusting: false,
      idleDrain: 1.25,
      thrustDrain: 9,
      maxFuel: 100,
    });
    assert.equal(idleFuel, 97.5);

    const thrustFuel = consumeFuel(80, 3, {
      isThrusting: true,
      idleDrain: 1,
      thrustDrain: 9,
      maxFuel: 100,
    });
    assert.equal(thrustFuel, 53);

    assert.equal(addFuel(91, 30, 100), 100);
    assert.equal(addFuel(20, -10, 100), 20);
    assert.equal(applyDamage(100, 30), 70);
    assert.equal(applyDamage(20, 50), 0);
  });

  it('builds track points across the requested range', () => {
    const first = createTrackPoint(0, 5);
    const middle = createTrackPoint(2, 5);
    const last = createTrackPoint(4, 5);

    assert.equal(first.z, 18);
    assert.equal(last.z, 338);
    assert.ok(middle.z > first.z);
    assert.ok(last.z > middle.z);
    assertNear(first.x, 0);
    assertNear(last.x, 0, 1e-8);
  });

  it('creates deterministic sorted spawn points for a given seed', () => {
    const points = generateSpawnPoints({
      count: 3,
      seed: 7,
      startZ: 10,
      spacing: 5,
      xSpread: 2,
      baseY: 1,
      yJitter: 0.5,
      zJitter: 1,
    });

    assert.equal(points.length, 3);
    assert.ok(points[0].z < points[1].z);
    assert.ok(points[1].z < points[2].z);

    assertNear(points[0].x, -1.9997808635232792);
    assertNear(points[1].z, 14.65862462637818);
    assertNear(points[2].scale, 1.3723231438755272);
  });
});

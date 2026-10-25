import assert from 'node:assert/strict';
import test from 'node:test';
import { randomSequence, mandelbulbDistance } from '../pulse-universe/model.js';

test('surface sampling is reproducible with bounded random coordinates', () => {
  const a = randomSequence(17);
  const b = randomSequence(17);
  const c = randomSequence(18);
  const values = Array.from({ length: 100 }, a);
  assert.deepEqual(values, Array.from({ length: 100 }, b));
  assert.notDeepEqual(values, Array.from({ length: 100 }, c));
  assert.ok(values.every(value => value >= 0 && value < 1));
});

test('supported formulas have finite distances and sample a nonempty surface', () => {
  for (const power of [4, 6, 8, 10]) {
    assert.equal(mandelbulbDistance(0, 0, 0, power), 0);
    assert.ok(mandelbulbDistance(4, 0, 0, power) > 0);
    const random = randomSequence();
    let count = 0;
    for (let index = 0; index < 5000; index += 1) {
      const point = Array.from({ length: 3 }, () => (random() * 2 - 1) * 1.3);
      const distance = mandelbulbDistance(...point, power);
      assert.ok(Number.isFinite(distance) && distance >= 0);
      if (Math.hypot(...point) <= 1.5 && distance > 0.001 && distance < 0.023) count += 1;
    }
    assert.ok(count > 50, `Power ${power} produced too few surface samples: ${count}`);
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateDayRate } from '../av-freelance/rate-calculator.js';

test('calculates a rounded freelance day rate', () => {
  const result = calculateDayRate({
    hourlyRate: 45,
    baseHours: 10,
    overtimeHours: 0,
    dailyCosts: 0,
    bufferPercent: 15
  });

  assert.equal(result.beforeBuffer, 450);
  assert.equal(result.suggestedRate, 525);
});

test('includes overtime and daily costs before adding the buffer', () => {
  const result = calculateDayRate({
    hourlyRate: 40,
    baseHours: 8,
    overtimeHours: 2,
    dailyCosts: 50,
    bufferPercent: 20
  });

  assert.equal(result.straightTime, 320);
  assert.equal(result.overtime, 120);
  assert.equal(result.beforeBuffer, 490);
  assert.equal(result.suggestedRate, 600);
});

test('rejects negative values', () => {
  assert.throws(() => calculateDayRate({
    hourlyRate: -1,
    baseHours: 10,
    overtimeHours: 0,
    dailyCosts: 0,
    bufferPercent: 0
  }), /non-negative numbers/);
});

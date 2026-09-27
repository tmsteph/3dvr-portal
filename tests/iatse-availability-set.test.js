import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  classifyAvailabilityResult,
  renderedWindowFor,
} = require('../scripts/ops/iatse-availability-set.cjs');

test('renderedWindowFor returns the inclusive portal window', () => {
  assert.deepEqual(
    renderedWindowFor(['2026-10-28', '2026-09-26', '2026-10-01']),
    { start: '2026-09-26', end: '2026-10-28' },
  );
});

test('future dates outside the rendered IATSE window are deferred, not failures', () => {
  const result = classifyAvailabilityResult(
    { '2026-10-29': 'Booked', '2026-11-01': 'Not Available' },
    { '2026-10-29': null, '2026-11-01': null },
    ['2026-09-26', '2026-10-28'],
  );
  assert.equal(result.mismatches.length, 0);
  assert.deepEqual(result.deferred.map(item => item.date), ['2026-10-29', '2026-11-01']);
});

test('a missing or wrong value inside the rendered window remains a real mismatch', () => {
  const result = classifyAvailabilityResult(
    { '2026-10-27': 'Booked', '2026-10-28': 'Booked' },
    { '2026-10-27': null, '2026-10-28': 'All Day' },
    ['2026-09-26', '2026-10-28'],
  );
  assert.deepEqual(result.deferred, []);
  assert.equal(result.mismatches.length, 2);
});

import test from 'node:test';
import assert from 'node:assert/strict';

import { evaluateOpportunityAvailability } from '../src/av-booking-availability.js';
import { buildWorkSchedulePlan } from '../src/work-schedule-coordinator.js';

test('dated opportunity derives clear availability from the schedule coordinator', () => {
  const plan = buildWorkSchedulePlan({
    horizonStart: '2026-10-01',
    horizonEnd: '2026-10-07',
  });
  const result = evaluateOpportunityAvailability({ startsAt: '2026-10-03' }, plan);

  assert.equal(result.availability, 'clear');
  assert.equal(result.hardBlock, false);
});

test('confirmed booked work creates a hard conflict for a competing opportunity', () => {
  const plan = buildWorkSchedulePlan({
    horizonStart: '2026-10-01',
    horizonEnd: '2026-10-07',
    gigs: [{ id: 'existing', date: '2026-10-03', status: 'Booked', source: 'freelance' }],
  });
  const result = evaluateOpportunityAvailability({ startsAt: '2026-10-03' }, plan);

  assert.equal(result.availability, 'conflict');
  assert.equal(result.hardBlock, true);
  assert.match(result.reasons[0], /existing booked work/);
});

test('protected personal dates block booking without pretending they are another job', () => {
  const plan = buildWorkSchedulePlan({
    horizonStart: '2026-10-01',
    horizonEnd: '2026-10-07',
    protectedCommitments: [{ id: 'family', date: '2026-10-03', countsAsRestDay: true }],
  });
  const result = evaluateOpportunityAvailability({ startsAt: '2026-10-03' }, plan);

  assert.equal(result.availability, 'blocked');
  assert.equal(result.hardBlock, true);
  assert.match(result.reasons[0], /protected commitment/);
});

test('distant sparse Encore dates stay visible as soft instead of hard conflicts', () => {
  const plan = buildWorkSchedulePlan({
    horizonStart: '2026-10-01',
    horizonEnd: '2026-10-31',
    encoreShifts: [{ id: 'encore', date: '2026-10-25', status: 'Booked' }],
  });
  const result = evaluateOpportunityAvailability({ startsAt: '2026-10-25' }, plan);

  assert.equal(result.availability, 'soft');
  assert.equal(result.hardBlock, false);
  assert.match(result.reasons[0], /soft\/replaceable/);
});

test('multi-day opportunity uses the strictest day in its date range', () => {
  const plan = buildWorkSchedulePlan({
    horizonStart: '2026-10-01',
    horizonEnd: '2026-10-07',
    gigs: [{ id: 'existing', date: '2026-10-04', status: 'Booked', source: 'freelance' }],
  });
  const result = evaluateOpportunityAvailability({
    startsAt: '2026-10-03',
    endsAt: '2026-10-05',
  }, plan);

  assert.equal(result.availability, 'conflict');
  assert.deepEqual(result.dates, ['2026-10-03', '2026-10-04', '2026-10-05']);
});

test('undated opportunities stay unknown instead of guessing', () => {
  const result = evaluateOpportunityAvailability({ title: 'A1' }, {});
  assert.equal(result.availability, 'unknown');
  assert.equal(result.hardBlock, false);
});


test('planner-selected rest days are soft because the rest block may move', () => {
  const plan = buildWorkSchedulePlan({
    horizonStart: '2026-10-01',
    horizonEnd: '2026-10-07',
  });
  assert.ok(plan.plannerRestDays.includes('2026-10-01'));

  const result = evaluateOpportunityAvailability({ startsAt: '2026-10-01' }, plan);
  assert.equal(result.availability, 'soft');
  assert.equal(result.hardBlock, false);
  assert.match(result.reasons[0], /two days off remain/);
});

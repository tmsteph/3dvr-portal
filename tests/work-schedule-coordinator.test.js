import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SCHEDULE_ACTION_TYPES,
  buildWorkSchedulePlan,
} from '../src/work-schedule-coordinator.js';

test('outside booked work creates an Encore time-off action and marks IATSE booked', () => {
  const plan = buildWorkSchedulePlan({
    horizonStart: '2026-09-01',
    horizonEnd: '2026-09-07',
    gigs: [{
      id: 'iatse-1',
      title: 'Convention A1',
      startDate: '2026-09-04',
      endDate: '2026-09-04',
      source: 'iatse',
      status: 'Booked',
    }],
  });

  assert.equal(plan.iatseAvailability['2026-09-04'], 'Booked');
  assert.equal(plan.metrics.encoreRequestsNeeded, 1);
  assert.ok(plan.actions.some(action => (
    action.type === SCHEDULE_ACTION_TYPES.REQUEST_ENCORE_OFF
    && action.date === '2026-09-04'
  )));
});

test('planner protects two consecutive rest days when the week allows it', () => {
  const plan = buildWorkSchedulePlan({
    horizonStart: '2026-09-07',
    horizonEnd: '2026-09-13',
    encoreShifts: [
      { id: 'e1', date: '2026-09-07', status: 'Booked' },
      { id: 'e2', date: '2026-09-10', status: 'Booked' },
      { id: 'e3', date: '2026-09-11', status: 'Booked' },
    ],
    minimumRestDays: 2,
  });

  assert.equal(plan.restDays.length, 2);
  const first = new Date(`${plan.restDays[0]}T12:00:00Z`);
  const second = new Date(`${plan.restDays[1]}T12:00:00Z`);
  assert.equal((second - first) / 86400000, 1);
  assert.equal(plan.iatseAvailability[plan.restDays[0]], 'Not Available');
  assert.equal(plan.iatseAvailability[plan.restDays[1]], 'Not Available');
});

test('protected personal commitments can count toward weekly rest days', () => {
  const plan = buildWorkSchedulePlan({
    horizonStart: '2026-09-01',
    horizonEnd: '2026-09-07',
    protectedCommitments: [
      { id: 'personal-1', date: '2026-09-02', countsAsRestDay: true },
      { id: 'personal-2', date: '2026-09-03', countsAsRestDay: true },
    ],
  });

  assert.deepEqual(plan.restDays.slice(0, 2), ['2026-09-02', '2026-09-03']);
  assert.equal(plan.iatseAvailability['2026-09-02'], 'Not Available');
  assert.equal(plan.iatseAvailability['2026-09-03'], 'Not Available');
});

test('double bookings are surfaced as blocked conflicts instead of silently overwritten', () => {
  const plan = buildWorkSchedulePlan({
    horizonStart: '2026-09-01',
    horizonEnd: '2026-09-07',
    gigs: [{ id: 'outside', date: '2026-09-05', source: 'freelance', status: 'Booked' }],
    encoreShifts: [{ id: 'encore', date: '2026-09-05', status: 'Booked' }],
  });

  assert.equal(plan.conflicts.length, 1);
  assert.equal(plan.conflicts[0].date, '2026-09-05');
  assert.ok(plan.actions.some(action => (
    action.type === SCHEDULE_ACTION_TYPES.RESOLVE_CONFLICT
    && action.status === 'blocked'
  )));
});

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SCHEDULE_ACTION_TYPES,
  buildWorkSchedulePlan,
  normalizeDateKey,
} from '../src/work-schedule-coordinator.js';

test('confirmed outside work with an approved rate creates an Encore time-off action and marks IATSE booked', () => {
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
      confirmed: true,
      rateApproved: true,
    }],
  });

  assert.equal(plan.iatseAvailability['2026-09-04'], 'Booked');
  assert.equal(plan.metrics.encoreRequestsNeeded, 1);
  assert.ok(plan.actions.some(action => (
    action.type === SCHEDULE_ACTION_TYPES.REQUEST_ENCORE_OFF
    && action.date === '2026-09-04'
  )));
});

test('Encore time-off stays blocked until dates are confirmed and rate is approved', () => {
  const plan = buildWorkSchedulePlan({
    horizonStart: '2026-09-01',
    horizonEnd: '2026-09-07',
    gigs: [
      { id: 'tentative', date: '2026-09-04', source: 'freelance', status: 'Booked', rateApproved: true },
      { id: 'cheap', date: '2026-09-05', source: 'freelance', status: 'Booked', confirmed: true },
    ],
  });

  assert.equal(plan.iatseAvailability['2026-09-04'], 'Booked');
  assert.equal(plan.iatseAvailability['2026-09-05'], 'Booked');
  assert.equal(plan.metrics.encoreRequestsNeeded, 0);
  assert.equal(plan.metrics.encoreRequestsBlockedByGate, 2);
  assert.equal(plan.actions.some(action => action.type === SCHEDULE_ACTION_TYPES.REQUEST_ENCORE_OFF), false);
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

test('distant Encore onesies and twosies stay open for IATSE or better freelance work', () => {
  const plan = buildWorkSchedulePlan({
    horizonStart: '2026-09-07',
    horizonEnd: '2026-10-04',
    encoreShifts: [
      { id: 'e1', date: '2026-10-01', status: 'Booked' },
      { id: 'e2', date: '2026-10-04', status: 'Booked' },
    ],
  });

  assert.equal(plan.iatseAvailability['2026-10-01'], 'All Day');
  assert.equal(plan.iatseAvailability['2026-10-04'], 'All Day');
  assert.deepEqual(plan.softEncoreDates, ['2026-10-01', '2026-10-04']);
  assert.equal(plan.metrics.encoreSoftDays, 2);
});

test('distant dense Encore weeks remain blocked', () => {
  const plan = buildWorkSchedulePlan({
    horizonStart: '2026-09-07',
    horizonEnd: '2026-10-04',
    encoreShifts: [
      { id: 'e1', date: '2026-09-28', status: 'Booked' },
      { id: 'e2', date: '2026-09-29', status: 'Booked' },
      { id: 'e3', date: '2026-09-30', status: 'Booked' },
    ],
  });

  assert.equal(plan.iatseAvailability['2026-09-28'], 'Booked');
  assert.equal(plan.iatseAvailability['2026-09-29'], 'Booked');
  assert.equal(plan.iatseAvailability['2026-09-30'], 'Booked');
  assert.deepEqual(plan.softEncoreDates, []);
});


test('two outside bookings on the same date are surfaced instead of overwritten', () => {
  const plan = buildWorkSchedulePlan({
    horizonStart: '2026-10-05',
    horizonEnd: '2026-10-11',
    gigs: [
      { id: 'freelance-a1', title: 'A1 - Client A', date: '2026-10-07', source: 'freelance', status: 'Booked' },
      { id: 'iatse-v1', title: 'V1 - IATSE', date: '2026-10-07', source: 'iatse', status: 'Booked' },
    ],
  });

  assert.equal(plan.conflicts.length, 1);
  assert.deepEqual(plan.conflicts[0].types, ['outside-vs-outside']);
  assert.deepEqual(plan.conflicts[0].outsideGigs.map(gig => gig.id), ['freelance-a1', 'iatse-v1']);
  assert.equal(plan.metrics.outsideBookedDays, 1);
});

test('ISO timestamps preserve their stated local calendar date', () => {
  assert.equal(normalizeDateKey('2026-10-07T23:30:00-07:00'), '2026-10-07');
  assert.equal(normalizeDateKey('2026-10-07T00:30:00+09:00'), '2026-10-07');
  assert.equal(normalizeDateKey('2026-02-30T10:00:00-08:00'), '');
});


test('ordinary protected appointments do not silently satisfy the rest-day quota', () => {
  const plan = buildWorkSchedulePlan({
    horizonStart: '2026-10-05',
    horizonEnd: '2026-10-11',
    minimumRestDays: 2,
    gigs: [
      { id: 'm', date: '2026-10-05', status: 'Booked' },
      { id: 'w', date: '2026-10-07', status: 'Booked' },
      { id: 'th', date: '2026-10-08', status: 'Booked' },
      { id: 'f', date: '2026-10-09', status: 'Booked' },
      { id: 'sa', date: '2026-10-10', status: 'Booked' },
    ],
    protectedCommitments: [
      { id: 'appointment', date: '2026-10-06', title: 'Personal appointment' },
    ],
  });

  assert.equal(plan.restDays.includes('2026-10-06'), false);
  assert.equal(plan.restDays.includes('2026-10-11'), true);
});


test('same-day timed gigs do not conflict when their intervals do not overlap', () => {
  const plan = buildWorkSchedulePlan({
    horizonStart: '2026-10-05',
    horizonEnd: '2026-10-11',
    gigs: [
      { id: 'camera-am', date: '2026-10-07', status: 'Booked', startTime: '08:00', endTime: '12:00' },
      { id: 'loadout-pm', date: '2026-10-07', status: 'Booked', startTime: '18:00', endTime: '22:00' },
    ],
  });

  assert.equal(plan.conflicts.length, 0);
  assert.equal(plan.iatseAvailability['2026-10-07'], 'Booked');
});

test('same-day timed gigs still conflict when their intervals overlap', () => {
  const plan = buildWorkSchedulePlan({
    horizonStart: '2026-10-05',
    horizonEnd: '2026-10-11',
    gigs: [
      { id: 'camera', date: '2026-10-07', status: 'Booked', startTime: '08:00', endTime: '14:00' },
      { id: 'a2', date: '2026-10-07', status: 'Booked', startTime: '13:00', endTime: '18:00' },
    ],
  });

  assert.equal(plan.conflicts.length, 1);
  assert.deepEqual(plan.conflicts[0].types, ['outside-vs-outside']);
});

test('missing time stays conservative when two commitments share a date', () => {
  const plan = buildWorkSchedulePlan({
    horizonStart: '2026-10-05',
    horizonEnd: '2026-10-11',
    gigs: [
      { id: 'known-time', date: '2026-10-07', status: 'Booked', startTime: '08:00', endTime: '12:00' },
      { id: 'unknown-time', date: '2026-10-07', status: 'Booked' },
    ],
  });

  assert.equal(plan.conflicts.length, 1);
});

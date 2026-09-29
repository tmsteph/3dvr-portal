import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildFreelancerDashboard,
  isFollowUpDue,
  normalizeFreelanceGig,
} from '../src/freelance-client-system.js';

test('follow-ups are due on or before today but lost clients are excluded', () => {
  assert.equal(isFollowUpDue({ status: 'Lead', nextFollowUp: '2026-08-30' }, '2026-08-30'), true);
  assert.equal(isFollowUpDue({ status: 'Lead', nextFollowUp: '2026-08-31' }, '2026-08-30'), false);
  assert.equal(isFollowUpDue({ status: 'Lost', nextFollowUp: '2026-08-20' }, '2026-08-30'), false);
});

test('dashboard prioritizes due clients and separates upcoming and unpaid gigs', () => {
  const dashboard = buildFreelancerDashboard({
    today: '2026-08-30',
    clients: [
      {
        id: 'warm-client',
        name: 'Warm Client',
        status: 'Lead',
        warmth: 'warm',
        nextFollowUp: '2026-08-30',
      },
      {
        id: 'repeat-client',
        name: 'Repeat Client',
        status: 'Active',
        warmth: 'hot',
        nextFollowUp: '2026-09-05',
      },
    ],
    gigs: [
      {
        id: 'booked',
        clientId: 'repeat-client',
        title: 'General Session',
        startDate: '2026-09-02',
        status: 'Booked',
      },
      {
        id: 'unpaid',
        clientId: 'warm-client',
        title: 'Breakout A1',
        startDate: '2026-08-20',
        status: 'Completed',
        paymentStatus: 'Invoiced',
      },
    ],
  });

  assert.deepEqual(dashboard.dueClients.map(client => client.id), ['warm-client']);
  assert.deepEqual(dashboard.upcomingGigs.map(gig => gig.id), ['booked']);
  assert.deepEqual(dashboard.unpaidGigs.map(gig => gig.id), ['unpaid']);
  assert.equal(dashboard.metrics.active, 1);
  assert.equal(dashboard.metrics.booked, 1);
  assert.equal(dashboard.metrics.unpaid, 1);
});

test('gig normalization keeps end date aligned with a single-day gig', () => {
  const gig = normalizeFreelanceGig({
    id: 'gig-1',
    title: 'A2',
    date: '2026-09-01',
  });

  assert.equal(gig.startDate, '2026-09-01');
  assert.equal(gig.endDate, '2026-09-01');
  assert.equal(gig.status, 'Booked');
});


test('gig normalization preserves valid call and wrap times', () => {
  const gig = normalizeFreelanceGig({
    id: 'timed-gig',
    date: '2026-10-07',
    startTime: '8:05',
    endTime: '17:30',
  });

  assert.equal(gig.startTime, '08:05');
  assert.equal(gig.endTime, '17:30');
});

test('gig normalization rejects malformed times instead of guessing', () => {
  const gig = normalizeFreelanceGig({
    id: 'bad-time',
    date: '2026-10-07',
    startTime: '25:00',
    endTime: 'later',
  });

  assert.equal(gig.startTime, '');
  assert.equal(gig.endTime, '');
});


test('freelancer dates preserve the stated local calendar day', () => {
  const gig = normalizeFreelanceGig({
    id: 'late-gig',
    startDate: '2026-10-07T23:30:00-07:00',
    endDate: '2026-10-07T23:59:00-07:00',
  });

  assert.equal(gig.startDate, '2026-10-07');
  assert.equal(gig.endDate, '2026-10-07');
});

test('freelancer dates reject impossible ISO-like dates', () => {
  const gig = normalizeFreelanceGig({
    id: 'invalid-date',
    startDate: '2026-02-30T10:00:00-08:00',
  });

  assert.equal(gig.startDate, '');
});

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

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createFreelanceStateEntry,
  normalizeFreelanceStateEntry,
} from '../src/freelance-state.js';

test('state entries keep the freelancer ledger deliberately small', () => {
  const entry = createFreelanceStateEntry({
    id: 'state-1',
    kind: 'Decision',
    subjectType: 'Gig',
    subjectId: 'gig-1',
    summary: 'Booked A1 gig',
    details: '$600/day · Ballroom',
    createdAt: '2026-08-31T22:30:00.000Z',
  });

  assert.deepEqual(entry, {
    id: 'state-1',
    kind: 'decision',
    subjectType: 'gig',
    subjectId: 'gig-1',
    summary: 'Booked A1 gig',
    details: '$600/day · Ballroom',
    createdAt: '2026-08-31T22:30:00.000Z',
    version: 1,
  });
});

test('invalid ledger kinds are rejected instead of becoming ambiguous memory', () => {
  assert.throws(() => createFreelanceStateEntry({
    id: 'state-2',
    kind: 'maybe',
    subjectType: 'client',
    subjectId: 'client-1',
    summary: 'Something happened',
  }), /invalid freelance state kind/);
});

test('normalization stores details as plain text for Gun compatibility', () => {
  const entry = normalizeFreelanceStateEntry({
    id: ' state-3 ',
    kind: 'FACT',
    subjectType: ' Opportunity ',
    subjectId: ' job-1 ',
    summary: ' New lead ',
    details: ' Source: referral ',
  });
  assert.equal(entry.kind, 'fact');
  assert.equal(entry.subjectType, 'opportunity');
  assert.equal(entry.details, 'Source: referral');
});

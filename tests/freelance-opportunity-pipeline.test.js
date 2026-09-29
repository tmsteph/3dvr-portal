import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildOpportunityPipeline,
  dedupeFreelanceOpportunities,
  getNextOpportunityStatus,
  getOpportunityDedupeKey,
  getOpportunityPriority,
  getOpportunityPriorityBreakdown,
  normalizeFreelanceOpportunity,
} from '../src/freelance-opportunity-pipeline.js';

test('opportunity normalization clamps fit score and preserves workflow fields', () => {
  const opportunity = normalizeFreelanceOpportunity({
    id: 'job-1',
    title: 'A1',
    company: 'Production Co',
    fitScore: 140,
    availability: 'clear',
  });

  assert.equal(opportunity.fitScore, 100);
  assert.equal(opportunity.status, 'Found');
  assert.equal(opportunity.canonicalStatus, 'discovered');
  assert.equal(opportunity.availability, 'clear');
});

test('pipeline separates ready, applied, conversations, and booked work', () => {
  const pipeline = buildOpportunityPipeline([
    { id: 'ready', title: 'A1', status: 'Ready', fitScore: 92 },
    { id: 'applied', title: 'Meeting Engineer', status: 'Applied', fitScore: 84 },
    { id: 'interview', title: 'Project Coordinator', status: 'Interview', fitScore: 78 },
    { id: 'booked', title: 'Show Call', status: 'Booked', fitScore: 75 },
    { id: 'passed', title: 'Low Rate', status: 'Passed', fitScore: 20 },
  ]);

  assert.deepEqual(pipeline.ready.map(item => item.id), ['ready']);
  assert.deepEqual(pipeline.applied.map(item => item.id), ['applied']);
  assert.deepEqual(pipeline.conversations.map(item => item.id), ['interview']);
  assert.deepEqual(pipeline.booked.map(item => item.id), ['booked']);
  assert.equal(pipeline.metrics.open, 3);
});

test('availability conflicts lower priority below otherwise similar work', () => {
  const clear = getOpportunityPriority({ status: 'Ready', fitScore: 80, availability: 'clear' });
  const conflict = getOpportunityPriority({ status: 'Ready', fitScore: 80, availability: 'conflict' });
  assert.ok(clear > conflict);
});

test('opportunity progression reaches booked from an offer', () => {
  assert.equal(getNextOpportunityStatus({ status: 'Found' }), 'Applied');
  assert.equal(getNextOpportunityStatus({ status: 'Offered' }), 'Booked');
  assert.equal(getNextOpportunityStatus({ status: 'Booked' }), '');
});

test('canonical lifecycle state can bridge into the freelancer pipeline', () => {
  const pipeline = buildOpportunityPipeline([
    { id: 'agent-sent', title: 'A1', status: 'legacy-unknown', canonicalStatus: 'contacted', fitScore: 80 },
    { id: 'agent-pending', title: 'V1', status: 'legacy-unknown', canonicalStatus: 'booking-pending', fitScore: 85 },
    { id: 'engine-won', title: 'Camera', status: 'legacy-unknown', canonicalStatus: 'booked', fitScore: 90 },
  ]);

  assert.deepEqual(pipeline.applied.map(item => item.id), ['agent-sent']);
  assert.deepEqual(pipeline.conversations.map(item => item.id), ['agent-pending']);
  assert.deepEqual(pipeline.booked.map(item => item.id), ['engine-won']);
});


test('duplicate listings collapse by canonical source URL without losing newer state', () => {
  const pipeline = buildOpportunityPipeline([
    {
      id: 'listing-a', title: 'A1', company: 'Production Co', status: 'Found', fitScore: 88,
      sourceUrl: 'https://jobs.example/call/123?ref=crew&utm_source=first', requirements: 'Dante',
      updatedAt: '2026-09-29T10:00:00Z',
    },
    {
      id: 'listing-b', title: 'A1', company: 'Production Co', status: 'Applied', fitScore: 90,
      sourceUrl: 'https://jobs.example/call/123?utm_source=second&ref=crew',
      updatedAt: '2026-09-29T11:00:00Z',
    },
  ]);

  assert.equal(pipeline.all.length, 1);
  assert.equal(pipeline.all[0].id, 'listing-b');
  assert.equal(pipeline.all[0].status, 'Applied');
  assert.equal(pipeline.all[0].requirements, 'Dante');
  assert.equal(pipeline.all[0].duplicateCount, 2);
  assert.deepEqual(new Set(pipeline.all[0].duplicateIds), new Set(['listing-a', 'listing-b']));
});

test('fallback dedupe keeps same role on different dates as separate opportunities', () => {
  const unique = dedupeFreelanceOpportunities([
    { id: 'day-1', title: 'Camera', company: 'Crew Co', startsAt: '2026-10-01T08:00:00-07:00' },
    { id: 'day-2', title: 'Camera', company: 'Crew Co', startsAt: '2026-10-02T08:00:00-07:00' },
  ]);

  assert.equal(unique.length, 2);
  assert.notEqual(getOpportunityDedupeKey(unique[0]), getOpportunityDedupeKey(unique[1]));
});

test('priority breakdown explains why an opportunity is ranked where it is', () => {
  const priority = getOpportunityPriorityBreakdown({ status: 'Ready', fitScore: 80, availability: 'clear' });
  assert.equal(priority.score, getOpportunityPriority({ status: 'Ready', fitScore: 80, availability: 'clear' }));
  assert.deepEqual(priority.reasons, ['80% fit', 'ready to act', 'calendar clear']);
});


test('a later source refresh cannot regress an already-contacted opportunity', () => {
  const pipeline = buildOpportunityPipeline([
    {
      id: 'applied-first',
      title: 'V1',
      company: 'Production Co',
      status: 'Applied',
      fitScore: 85,
      sourceUrl: 'https://jobs.example/call/456',
      appliedAt: '2026-09-29T10:00:00Z',
      updatedAt: '2026-09-29T10:00:00Z',
    },
    {
      id: 'rediscovered-later',
      title: 'V1',
      company: 'Production Co',
      status: 'Found',
      fitScore: 87,
      sourceUrl: 'https://jobs.example/call/456?utm_source=refresh',
      updatedAt: '2026-09-29T12:00:00Z',
    },
  ]);

  assert.equal(pipeline.all.length, 1);
  assert.equal(pipeline.all[0].status, 'Applied');
  assert.equal(pipeline.all[0].canonicalStatus, 'contacted');
  assert.equal(pipeline.all[0].appliedAt, '2026-09-29T10:00:00Z');
});

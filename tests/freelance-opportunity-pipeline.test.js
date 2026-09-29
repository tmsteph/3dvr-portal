import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildOpportunityPipeline,
  getNextOpportunityStatus,
  getOpportunityPriority,
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
  assert.equal(pipeline.metrics.open, 4);
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

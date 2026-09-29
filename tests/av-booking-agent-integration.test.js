import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ingestOpportunity,
  updateOpportunity,
} from '../src/money-printer/opportunityEngine.js';
import { buildWorkSchedulePlan } from '../src/work-schedule-coordinator.js';
import { evaluateOpportunityAvailability } from '../src/av-booking-availability.js';
import {
  normalizeFreelanceOpportunity,
  getOpportunityPriority,
} from '../src/freelance-opportunity-pipeline.js';
import { projectOpportunityStatus } from '../src/opportunity-lifecycle.js';

const NOW = new Date('2026-09-29T18:00:00Z');

test('AV booking flow composes ingestion, twin isolation, scheduling, ranking, and lifecycle', () => {
  const first = ingestOpportunity({}, {
    twinId: 'thomas',
    owner: 'Thomas',
    sourceLabel: 'Indeed',
    externalId: 'indeed-100',
    need: 'Videographer - San Diego Convention Center - Oct 4',
    buyerWords: 'Videographer needed Oct 4 in San Diego',
    location: 'San Diego, CA',
    fitScore: 92,
    estimatedValueMin: 650,
  }, NOW);

  const syndicated = ingestOpportunity(first.state, {
    twinId: 'thomas',
    owner: 'Thomas',
    sourceLabel: 'Company careers',
    externalId: 'career-100',
    need: 'Videographer - San Diego Convention Center - Oct 4',
    buyerWords: 'Videographer needed Oct 4 in San Diego',
    location: 'San Diego, CA',
  }, NOW);

  assert.equal(syndicated.state.opportunities.length, 1);
  assert.equal(syndicated.state.opportunities[0].signals.length, 2);

  const mark = ingestOpportunity(syndicated.state, {
    twinId: 'mark-wells',
    owner: 'Mark Wells',
    sourceLabel: 'Indeed',
    externalId: 'indeed-100',
    need: 'Videographer - San Diego Convention Center - Oct 4',
    buyerWords: 'Videographer needed Oct 4 in San Diego',
    location: 'San Diego, CA',
  }, NOW);

  assert.equal(mark.state.opportunities.length, 2);

  const schedule = buildWorkSchedulePlan({
    horizonStart: '2026-10-01',
    horizonEnd: '2026-10-07',
    encoreShifts: [
      { id: 'encore-4', date: '2026-10-04', status: 'Booked' },
    ],
  });
  assert.equal(schedule.iatseAvailability['2026-10-04'], 'Booked');

  const thomasOpportunity = mark.state.opportunities.find(item => item.twinId === 'thomas');
  const scheduleAssessment = evaluateOpportunityAvailability({ startsAt: '2026-10-04' }, schedule);
  assert.equal(scheduleAssessment.availability, 'conflict');
  assert.equal(scheduleAssessment.hardBlock, true);

  const conflictedState = updateOpportunity(
    mark.state,
    thomasOpportunity.id,
    { availability: scheduleAssessment.availability, status: 'response-ready' },
    NOW,
  );
  const conflicted = conflictedState.opportunities.find(item => item.id === thomasOpportunity.id);

  assert.equal(conflicted.hardAvailabilityConflict, true);
  assert.equal(conflicted.priorityScore, 0);
  assert.equal(conflicted.canonicalStatus, 'ready');

  const freelancerView = normalizeFreelanceOpportunity({
    id: conflicted.id,
    title: conflicted.title,
    status: projectOpportunityStatus(conflicted.canonicalStatus, 'freelance'),
    canonicalStatus: conflicted.canonicalStatus,
    availability: conflicted.availability,
    fitScore: conflicted.fitScore,
  });

  assert.equal(freelancerView.status, 'Ready');
  assert.equal(freelancerView.canonicalStatus, 'ready');
  assert.ok(getOpportunityPriority(freelancerView) < freelancerView.fitScore);

  const bookedState = updateOpportunity(
    conflictedState,
    thomasOpportunity.id,
    { status: 'won', availability: 'clear' },
    NOW,
  );
  const booked = bookedState.opportunities.find(item => item.id === thomasOpportunity.id);

  assert.equal(booked.canonicalStatus, 'booked');
  assert.equal(projectOpportunityStatus(booked.canonicalStatus, 'freelance'), 'Booked');
  assert.equal(projectOpportunityStatus(booked.canonicalStatus, 'work-agent'), 'booked');

  const markOpportunity = bookedState.opportunities.find(item => item.twinId === 'mark-wells');
  assert.equal(markOpportunity.canonicalStatus, 'discovered');
});

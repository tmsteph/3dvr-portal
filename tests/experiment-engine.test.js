import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assignVariant,
  canAutoPromote,
  computeConversionStats,
  pickConversionWinner,
} from '../src/growth/experiment-engine.js';
import { AV_FREELANCE_HERO_EXPERIMENT } from '../src/growth/experiments.js';

function makeEvents({ ownershipViews = 0, ownershipConversions = 0, outcomeViews = 0, outcomeConversions = 0 } = {}) {
  const events = {};
  const add = (variant, eventType, index) => {
    const id = `${variant}-${eventType}-${index}`;
    events[id] = {
      id,
      experimentId: AV_FREELANCE_HERO_EXPERIMENT.id,
      page: AV_FREELANCE_HERO_EXPERIMENT.page,
      variant,
      eventType,
      visitorId: `${variant}-visitor-${index}`,
    };
  };
  for (let i = 0; i < ownershipViews; i += 1) add('ownership', 'view', i);
  for (let i = 0; i < ownershipConversions; i += 1) add('ownership', 'work-agent-open', i);
  for (let i = 0; i < outcomeViews; i += 1) add('outcome', 'view', i);
  for (let i = 0; i < outcomeConversions; i += 1) add('outcome', 'work-agent-open', i);
  return events;
}

test('experiment assignment is stable per visitor and a promoted winner overrides the split', () => {
  const first = assignVariant(AV_FREELANCE_HERO_EXPERIMENT, 'visitor-123');
  const second = assignVariant(AV_FREELANCE_HERO_EXPERIMENT, 'visitor-123');
  assert.equal(first, second);
  assert.ok(['ownership', 'outcome'].includes(first));
  assert.equal(assignVariant(AV_FREELANCE_HERO_EXPERIMENT, 'visitor-123', 'outcome'), 'outcome');
});

test('conversion stats ignore unrelated events and calculate per-variant rates', () => {
  const events = makeEvents({ ownershipViews: 10, ownershipConversions: 3, outcomeViews: 10, outcomeConversions: 1 });
  events.other = { id: 'other', visitorId: 'other', experimentId: 'other', page: 'av-freelance', variant: 'ownership', eventType: 'view' };
  events.duplicate = { ...events['ownership-work-agent-open-0'], id: 'duplicate-click' };
  const stats = computeConversionStats(AV_FREELANCE_HERO_EXPERIMENT, events);
  assert.deepEqual(stats.ownership, { views: 10, conversions: 3, conversionRate: 0.3 });
  assert.deepEqual(stats.outcome, { views: 10, conversions: 1, conversionRate: 0.1 });
});

test('winner selection waits for enough evidence and then requires a significant lift', () => {
  const tooEarly = computeConversionStats(
    AV_FREELANCE_HERO_EXPERIMENT,
    makeEvents({ ownershipViews: 20, ownershipConversions: 8, outcomeViews: 20, outcomeConversions: 1 })
  );
  assert.equal(pickConversionWinner(AV_FREELANCE_HERO_EXPERIMENT, tooEarly), null);

  const enough = computeConversionStats(
    AV_FREELANCE_HERO_EXPERIMENT,
    makeEvents({ ownershipViews: 100, ownershipConversions: 20, outcomeViews: 100, outcomeConversions: 8 })
  );
  const winner = pickConversionWinner(AV_FREELANCE_HERO_EXPERIMENT, enough);
  assert.equal(winner?.key, 'ownership');
  assert.ok(winner.zScore >= 1.96);
  assert.match(winner.reason, /20\.0% vs 8\.0%/);
});

test('auto promotion is allowlisted to low-risk experiment classes', () => {
  assert.equal(canAutoPromote(AV_FREELANCE_HERO_EXPERIMENT), true);
  assert.equal(canAutoPromote({ ...AV_FREELANCE_HERO_EXPERIMENT, riskClass: 'pricing' }), false);
  assert.equal(canAutoPromote({ ...AV_FREELANCE_HERO_EXPERIMENT, riskClass: 'privacy' }), false);
});

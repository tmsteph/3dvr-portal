import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  OPPORTUNITY_ENGINE_SCHEMA_VERSION,
  addOpportunity,
  createDemandSignal,
  createOpportunityCluster,
  createOpportunityEngineState,
  readOpportunityEngineState,
  sortOpportunityClusters,
  updateOpportunity,
  writeOpportunityEngineState
} from '../src/money-printer/opportunityEngine.js';

const NOW = new Date('2026-08-01T17:00:00.000Z');

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
    removeItem(key) { values.delete(key); }
  };
}

describe('Money Printer Opportunity Engine', () => {
  it('creates versioned demand evidence with provenance and permission state', () => {
    const signal = createDemandSignal({
      need: '200 business cards tomorrow',
      buyerWords: 'I need 200 business cards before our event tomorrow morning.',
      location: 'San Diego',
      urgency: 'immediate',
      sourceLabel: 'Forwarded email',
      acquisitionMode: 'manual-forward',
      policyStatus: 'human-provided',
      contactPermission: 'review-required'
    }, NOW);

    assert.equal(signal.schemaVersion, OPPORTUNITY_ENGINE_SCHEMA_VERSION);
    assert.equal(signal.need, '200 business cards tomorrow');
    assert.match(signal.buyerWords, /event tomorrow/);
    assert.equal(signal.policyStatus, 'human-provided');
    assert.equal(signal.contactPermission, 'review-required');
  });

  it('ranks urgent, evidenced, permitted demand above vague demand', () => {
    const strong = createOpportunityCluster({
      id: 'strong',
      need: 'Urgent print delivery',
      buyerWords: 'We need 200 cards delivered by 8 AM tomorrow.',
      urgency: 'immediate',
      confidence: 90,
      policyStatus: 'human-provided',
      estimatedValueMin: 250,
      estimatedCostMax: 120
    }, NOW);
    const vague = createOpportunityCluster({
      id: 'vague',
      need: 'Maybe help someday',
      urgency: 'low',
      confidence: 20,
      policyStatus: 'unknown'
    }, NOW);

    assert.deepEqual(sortOpportunityClusters([vague, strong], NOW).map(item => item.id), ['strong', 'vague']);
  });

  it('preserves passed opportunities for learning while removing them from active priority', () => {
    let state = addOpportunity(createOpportunityEngineState({}, NOW), {
      id: 'signal-one',
      need: 'AV support this week',
      buyerWords: 'We need an A1 for our event this Thursday.'
    }, NOW);
    const opportunityId = state.opportunities[0].id;
    state = updateOpportunity(state, opportunityId, { status: 'passed' }, NOW);

    assert.equal(state.opportunities.length, 1);
    assert.equal(state.opportunities[0].status, 'passed');
    assert.equal(state.signals.length, 1);
  });

  it('round-trips the versioned state through browser-compatible storage', () => {
    const storage = memoryStorage();
    const state = addOpportunity({}, {
      need: 'Landing page by Friday',
      buyerWords: 'Can someone build a launch page before Friday?',
      policyStatus: 'human-provided'
    }, NOW);

    assert.equal(writeOpportunityEngineState(state, storage), true);
    const restored = readOpportunityEngineState(storage);
    assert.equal(restored.schemaVersion, OPPORTUNITY_ENGINE_SCHEMA_VERSION);
    assert.equal(restored.opportunities.length, 1);
    assert.equal(restored.signals.length, 1);
    assert.equal(restored.opportunities[0].title, 'Landing page by Friday');
  });
});

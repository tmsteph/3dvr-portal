import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  OPPORTUNITY_ENGINE_SCHEMA_VERSION,
  addOpportunity,
  createDemandSignal,
  createOpportunityCluster,
  createOpportunityEngineState,
  ingestOpportunity,
  opportunitySignalFingerprint,
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

  it('keeps profit, alignment, fulfillment, and mode visible in inbox priority', () => {
    const profitFirst = createOpportunityCluster({
      id: 'profit-first',
      need: 'Profitable service gap',
      buyerWords: 'We need this handled this week and have budget.',
      urgency: 'high',
      confidence: 80,
      policyStatus: 'human-provided',
      estimatedValueMin: 500,
      estimatedCostMax: 150,
      searchMode: 'profit',
      profitScore: 95,
      alignmentScore: 10,
      fulfillmentScore: 80
    }, NOW);
    const aligned = createOpportunityCluster({
      id: 'aligned',
      need: 'Mission aligned project',
      buyerWords: 'We need this handled this week and have budget.',
      urgency: 'high',
      confidence: 80,
      policyStatus: 'human-provided',
      estimatedValueMin: 500,
      estimatedCostMax: 150,
      searchMode: 'profit',
      profitScore: 35,
      alignmentScore: 98,
      fulfillmentScore: 80
    }, NOW);

    assert.equal(profitFirst.searchMode, 'profit');
    assert.equal(profitFirst.profitScore, 95);
    assert.equal(profitFirst.alignmentScore, 10);
    assert.ok(profitFirst.priorityScore > 0);
    assert.deepEqual(sortOpportunityClusters([aligned, profitFirst], NOW).map(item => item.id), ['profit-first', 'aligned']);
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

  it('links an opportunity into the canonical operating graph', () => {
    let state = addOpportunity({}, {
      need: 'Website automation sprint',
      buyerWords: 'We need the lead form connected to follow-up this week.',
      personId: 'person-tom',
      organizationId: 'org-example',
      taskIds: ['task-qualify'],
      messageIds: ['message-1'],
      expectedOutcome: 'Paid automation sprint',
      nextActionOwner: 'Thomas',
      followUpAt: '2026-08-03T16:00:00Z'
    }, NOW);

    const opportunityId = state.opportunities[0].id;
    assert.deepEqual(state.opportunities[0].links, {
      personId: 'person-tom',
      organizationId: 'org-example',
      projectId: '',
      taskIds: ['task-qualify'],
      messageIds: ['message-1'],
      calendarEventIds: [],
      paymentIds: [],
      artifactIds: []
    });
    assert.equal(state.opportunities[0].expectedOutcome, 'Paid automation sprint');
    assert.equal(state.opportunities[0].followUpAt, '2026-08-03T16:00:00.000Z');

    state = updateOpportunity(state, opportunityId, {
      status: 'won',
      projectId: 'project-42',
      links: { paymentIds: ['payment-1'] }
    }, NOW);

    assert.equal(state.opportunities[0].links.personId, 'person-tom');
    assert.equal(state.opportunities[0].links.projectId, 'project-42');
    assert.deepEqual(state.opportunities[0].links.paymentIds, ['payment-1']);
    assert.deepEqual(state.opportunities[0].links.taskIds, ['task-qualify']);
  });

  it('round-trips the versioned state through browser-compatible storage', () => {
    const storage = memoryStorage();
    const state = addOpportunity({}, {
      need: 'Landing page by Friday',
      buyerWords: 'Can someone build a launch page before Friday?',
      policyStatus: 'human-provided',
      personId: 'person-1',
      paymentIds: ['payment-1']
    }, NOW);

    assert.equal(writeOpportunityEngineState(state, storage), true);
    const restored = readOpportunityEngineState(storage);
    assert.equal(restored.schemaVersion, OPPORTUNITY_ENGINE_SCHEMA_VERSION);
    assert.equal(restored.opportunities.length, 1);
    assert.equal(restored.signals.length, 1);
    assert.equal(restored.opportunities[0].title, 'Landing page by Friday');
    assert.equal(restored.opportunities[0].links.personId, 'person-1');
    assert.deepEqual(restored.opportunities[0].links.paymentIds, ['payment-1']);
  });

  it('deduplicates repeated first-party submissions by source id', () => {
    const intake = {
      externalId: 'form-4821',
      acquisitionMode: 'first-party-form',
      policyStatus: 'first-party',
      need: 'Website help',
      buyerWords: 'Please help us repair our company website.'
    };
    const first = ingestOpportunity({}, intake, NOW);
    const repeated = ingestOpportunity(first.state, { ...intake, buyerWords: 'Changed webhook copy' }, NOW);

    assert.equal(first.created, true);
    assert.equal(repeated.created, false);
    assert.equal(repeated.state.opportunities.length, 1);
    assert.equal(opportunitySignalFingerprint(intake), 'first-party-form:form-4821');
  });

  it('deduplicates manual forwards using normalized evidence when no source id exists', () => {
    const first = ingestOpportunity({}, {
      sourceLabel: 'Forwarded email',
      need: 'AV support',
      buyerWords: 'We need an A1 this Friday.'
    }, NOW);
    const repeated = ingestOpportunity(first.state, {
      sourceLabel: 'forwarded EMAIL',
      need: 'av support',
      buyerWords: '  We need an A1 this Friday.  '
    }, NOW);

    assert.equal(repeated.created, false);
    assert.equal(repeated.state.signals.length, 1);
  });
});
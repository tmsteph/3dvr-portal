import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  OPPORTUNITY_ENGINE_SCHEMA_VERSION,
  addOpportunity,
  createDemandSignal,
  createOpportunityCluster,
  createOpportunityEngineState,
  ingestOpportunity,
  opportunityCanonicalFingerprint,
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

  it('deduplicates the same source record across acquisition paths', () => {
    const first = ingestOpportunity({}, {
      sourceLabel: 'Crew Portal',
      externalId: 'CALL-4242',
      acquisitionMode: 'api',
      need: 'A1 call',
      buyerWords: 'Need an A1 tomorrow.'
    }, NOW);
    const repeated = ingestOpportunity(first.state, {
      sourceLabel: 'Crew Portal',
      externalId: 'CALL-4242',
      acquisitionMode: 'manual-forward',
      need: 'A1 call',
      buyerWords: 'Need an A1 tomorrow.'
    }, NOW);

    assert.equal(repeated.created, false);
    assert.equal(repeated.state.opportunities.length, 1);
    assert.equal(opportunitySignalFingerprint({
      sourceLabel: 'Crew Portal',
      externalId: 'CALL-4242',
      acquisitionMode: 'api'
    }), 'crew portal:call-4242');
  });

  it('hard availability conflicts remove executable priority', () => {
    const conflict = createOpportunityCluster({
      id: 'conflict',
      status: 'new',
      need: 'High-value A1 call',
      buyerWords: 'Confirmed A1 call with strong day rate.',
      urgency: 'immediate',
      confidence: 95,
      policyStatus: 'first-party',
      estimatedValueMin: 750,
      fitScore: 95,
      fulfillmentScore: 95,
      availability: 'conflict'
    }, NOW);
    const clear = createOpportunityCluster({
      id: 'clear',
      status: 'new',
      need: 'Available A2 call',
      buyerWords: 'Confirmed A2 call with good day rate.',
      urgency: 'high',
      confidence: 90,
      policyStatus: 'first-party',
      estimatedValueMin: 500,
      fitScore: 82,
      fulfillmentScore: 90,
      availability: 'clear'
    }, NOW);

    assert.equal(conflict.priorityScore, 0);
    assert.equal(conflict.hardAvailabilityConflict, true);
    assert.equal(clear.hardAvailabilityConflict, false);
    assert.deepEqual(sortOpportunityClusters([conflict, clear], NOW).map(item => item.id), ['clear', 'conflict']);
  });

  it('expired new work sorts behind live response-ready work', () => {
    const expired = createOpportunityCluster({
      id: 'expired',
      status: 'new',
      need: 'Old call',
      buyerWords: 'Need someone urgently.',
      urgency: 'immediate',
      confidence: 95,
      expiresAt: '2026-07-31T12:00:00Z'
    }, NOW);
    const live = createOpportunityCluster({
      id: 'live',
      status: 'response-ready',
      need: 'Live call',
      buyerWords: 'Need someone tomorrow.',
      urgency: 'high',
      confidence: 90,
      expiresAt: '2026-08-02T12:00:00Z'
    }, NOW);

    assert.equal(expired.expired, true);
    assert.equal(live.expired, false);
    assert.deepEqual(sortOpportunityClusters([expired, live], NOW).map(item => item.id), ['live', 'expired']);
  });


  it('keeps legacy Thomas scope explicit and supports isolated twin ids', () => {
    const legacy = createOpportunityCluster({
      id: 'legacy',
      need: 'Legacy Thomas opportunity'
    }, NOW);
    const mark = createOpportunityCluster({
      id: 'mark',
      twinId: 'mark-wells',
      owner: 'Mark Wells',
      need: 'Mark opportunity'
    }, NOW);

    assert.equal(legacy.twinId, 'thomas-legacy');
    assert.equal(legacy.scopeStatus, 'legacy-default');
    assert.equal(mark.twinId, 'mark-wells');
    assert.equal(mark.scopeStatus, 'scoped');
    assert.equal(mark.owner, 'Mark Wells');
  });


it('clusters the same syndicated job across sources while preserving both evidence signals', () => {
  const first = ingestOpportunity({}, {
    sourceLabel: 'Indeed',
    externalId: 'indeed-123',
    need: 'Videographer - San Diego Convention Center - Oct 4',
    buyerWords: 'Videographer needed Oct 4 in San Diego',
    location: 'San Diego, CA'
  }, NOW);
  const second = ingestOpportunity(first.state, {
    sourceLabel: 'Company careers',
    externalId: 'careers-987',
    need: 'Videographer - San Diego Convention Center - Oct 4',
    buyerWords: 'Videographer needed Oct 4 in San Diego',
    location: 'San Diego, CA'
  }, NOW);

  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(second.clustered, true);
  assert.equal(second.state.opportunities.length, 1);
  assert.equal(second.state.signals.length, 2);
  assert.equal(second.state.opportunities[0].signals.length, 2);
  assert.equal(
    opportunityCanonicalFingerprint({
      need: 'Videographer - San Diego Convention Center - Oct 4',
      location: 'San Diego, CA'
    }),
    'job|videographer san diego convention center oct 4|san diego ca|10-04'
  );
});

it('does not cross-source cluster vague jobs without enough identity anchors', () => {
  const first = ingestOpportunity({}, {
    sourceLabel: 'Board A',
    need: 'A1 needed',
    buyerWords: 'Need an A1 soon.'
  }, NOW);
  const second = ingestOpportunity(first.state, {
    sourceLabel: 'Board B',
    need: 'A1 needed',
    buyerWords: 'Need an A1 soon.'
  }, NOW);

  assert.equal(second.created, true);
  assert.equal(second.state.opportunities.length, 2);
});


it('Opportunity Engine exposes canonical lifecycle state without changing legacy status', () => {
  const contacted = createOpportunityCluster({
    id: 'contacted',
    status: 'contacted',
    need: 'A1 call'
  }, NOW);
  const won = createOpportunityCluster({
    id: 'won',
    status: 'won',
    need: 'Booked show'
  }, NOW);

  assert.equal(contacted.status, 'contacted');
  assert.equal(contacted.canonicalStatus, 'contacted');
  assert.equal(won.status, 'won');
  assert.equal(won.canonicalStatus, 'booked');
});


it('does not dedupe or cluster the same job across different twins', () => {
  const thomas = ingestOpportunity({}, {
    twinId: 'thomas',
    owner: 'Thomas',
    sourceLabel: 'Crew Portal',
    externalId: 'CALL-9',
    need: 'A1 - Oct 10',
    location: 'San Diego, CA'
  }, NOW);
  const mark = ingestOpportunity(thomas.state, {
    twinId: 'mark-wells',
    owner: 'Mark Wells',
    sourceLabel: 'Crew Portal',
    externalId: 'CALL-9',
    need: 'A1 - Oct 10',
    location: 'San Diego, CA'
  }, NOW);

  assert.equal(mark.created, true);
  assert.equal(mark.state.opportunities.length, 2);
  assert.deepEqual(
    new Set(mark.state.opportunities.map(item => item.twinId)),
    new Set(['thomas', 'mark-wells'])
  );
  assert.deepEqual(
    new Set(mark.state.signals.map(item => item.twinId)),
    new Set(['thomas', 'mark-wells'])
  );
});

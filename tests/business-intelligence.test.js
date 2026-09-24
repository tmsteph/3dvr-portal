import test from 'node:test';
import assert from 'node:assert/strict';
import {
  matchBusinessNeedsToProviders,
  matchBusinessesToEachOther,
  providerProfilesFromBusinesses,
  summarizeBusinessNeeds,
  topBusinessNeed
} from '../src/money-printer/businessIntelligence.js';

test('business intelligence groups repeated needs across leads', () => {
  const leads = [
    {
      name: 'Acme Cleaning',
      solutionRoute: '3dvr',
      needs: [
        { need: 'Clearer online booking path', confidence: 0.9, kind: 'observed' },
        { need: 'Faster lead follow-up', confidence: 0.7, kind: 'inferred' }
      ]
    },
    {
      name: 'Beta Cleaning',
      solutionRoute: 'either',
      needs: [
        { need: 'Clearer online booking path', confidence: 0.8, kind: 'inferred' }
      ]
    }
  ];

  const summary = summarizeBusinessNeeds(leads);
  assert.equal(summary[0].need, 'Clearer online booking path');
  assert.equal(summary[0].count, 2);
  assert.equal(summary[0].observed, 1);
  assert.equal(summary[0].inferred, 1);
  assert.ok(Math.abs(summary[0].averageConfidence - 0.85) < 1e-9);
  assert.deepEqual(summary[0].businesses, ['Acme Cleaning', 'Beta Cleaning']);
  assert.equal(summary[0].solutionRoutes['3dvr'], 1);
  assert.equal(summary[0].solutionRoutes.either, 1);
  assert.equal(topBusinessNeed(leads).key, summary[0].key);
});

test('business intelligence ignores weak hypotheses by default', () => {
  const summary = summarizeBusinessNeeds([{
    name: 'Low Signal Co',
    needs: [{ need: 'Maybe needs a CRM', confidence: 0.2, kind: 'inferred' }]
  }]);

  assert.deepEqual(summary, []);
});


test('business intelligence matches needs to public capabilities', () => {
  const providers = [
    {
      id: 'scheduler',
      name: 'Scheduling Co',
      capabilities: ['booking automation', 'calendar integration'],
      location: 'San Diego'
    },
    {
      id: 'photo',
      name: 'Photo Co',
      capabilities: ['restaurant photography']
    }
  ];
  const [result] = matchBusinessNeedsToProviders([
    {
      need: 'Booking automation',
      confidence: 0.9,
      kind: 'observed'
    }
  ], providers);

  assert.equal(result.matches[0].providerName, 'Scheduling Co');
  assert.equal(result.matches[0].capability, 'booking automation');
  assert.equal(result.matches[0].score, 1);
});

test('business intelligence can discover supplier candidates inside a lead batch', () => {
  const businesses = [
    {
      name: 'Busy Cleaner',
      email: 'cleaner@example.test',
      capabilities: ['residential cleaning'],
      needs: [{ need: 'Booking automation', confidence: 0.82, kind: 'inferred' }]
    },
    {
      name: 'Workflow Shop',
      email: 'workflow@example.test',
      capabilities: ['booking automation', 'CRM integration'],
      needs: []
    }
  ];

  const providers = providerProfilesFromBusinesses(businesses);
  assert.equal(providers.length, 2);
  const matches = matchBusinessesToEachOther(businesses);
  assert.equal(matches[0].business, 'Busy Cleaner');
  assert.equal(matches[0].matches[0].matches[0].providerName, 'Workflow Shop');
  assert.equal(matches[0].matches[0].matches[0].score, 1);
  assert.equal(matches[1].matches.length, 0);
});

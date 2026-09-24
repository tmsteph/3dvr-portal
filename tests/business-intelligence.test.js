import test from 'node:test';
import assert from 'node:assert/strict';
import {
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
  assert.equal(summary[0].averageConfidence, 0.85);
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

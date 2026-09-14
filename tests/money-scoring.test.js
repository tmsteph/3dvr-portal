import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeOpportunitySearchMode,
  rankOpportunities,
  scoreOpportunity
} from '../src/money/scoring.js';

const base = {
  painScore: 70,
  willingnessToPay: 70,
  speedToBuild: 70,
  competitionGap: 70,
  fulfillmentScore: 70
};

test('opportunity scoring keeps economic and personal alignment dimensions separate', () => {
  const scored = scoreOpportunity({
    ...base,
    title: 'Strong economics outside current interests',
    profitScore: 92,
    alignmentScore: 18
  }, undefined, 'portfolio');

  assert.equal(scored.searchMode, 'portfolio');
  assert.equal(scored.profitScore, 92);
  assert.equal(scored.alignmentScore, 18);
  assert.equal(scored.fulfillmentScore, 70);
  assert.ok(scored.marketScore > 0);
  assert.ok(scored.score > 0);
});

test('profit and aligned modes can intentionally rank the same candidates differently', () => {
  const cash = { ...base, id: 'cash', title: 'Cash engine', profitScore: 96, alignmentScore: 10 };
  const mission = { ...base, id: 'mission', title: 'Mission engine', profitScore: 35, alignmentScore: 98 };

  assert.deepEqual(rankOpportunities([mission, cash], undefined, 'profit').map(item => item.id), ['cash', 'mission']);
  assert.deepEqual(rankOpportunities([cash, mission], undefined, 'aligned').map(item => item.id), ['mission', 'cash']);
});

test('invalid search modes fall back to portfolio', () => {
  assert.equal(normalizeOpportunitySearchMode('anything-goes'), 'portfolio');
});

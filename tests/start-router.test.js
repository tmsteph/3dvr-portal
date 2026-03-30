import test from 'node:test';
import assert from 'node:assert/strict';
import { getRouteKey, getRecommendation } from '../start/router.js';

test('start router sends clarity-first answers to Life', () => {
  const key = getRouteKey({
    pain: 'scattered',
    goal: 'clarity',
    support: 'free',
  });

  assert.equal(key, 'life');
  assert.equal(getRecommendation({ pain: 'scattered', goal: 'clarity', support: 'free' }).title, 'Start with Life');
});

test('start router sends accountability answers to Cell', () => {
  const key = getRouteKey({
    pain: 'alone',
    goal: 'community',
    support: 'community',
  });

  assert.equal(key, 'cell');
  assert.match(
    getRecommendation({ pain: 'alone', goal: 'community', support: 'community' }).plan,
    /Family & Friends \$5/
  );
});

test('start router sends launch answers to Founder or Builder based on income pressure', () => {
  assert.equal(
    getRouteKey({ pain: 'scattered', goal: 'launch', support: 'direct' }),
    'founder'
  );
  assert.equal(
    getRouteKey({ pain: 'income', goal: 'launch', support: 'direct' }),
    'builder'
  );
});

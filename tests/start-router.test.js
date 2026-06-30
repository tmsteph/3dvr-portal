import test from 'node:test';
import assert from 'node:assert/strict';
import { getRouteKey, getRecommendation } from '../start/router.js';

test('start router sends clarity-first answers to Life', () => {
  const key = getRouteKey({
    project: 'personal',
    stage: 'idea',
    support: 'free',
  });

  assert.equal(key, 'life');
  assert.equal(
    getRecommendation({ project: 'personal', stage: 'idea', support: 'free' }).title,
    'Start free with Daily Direction'
  );
  assert.equal(
    getRecommendation({ project: 'personal', stage: 'idea', support: 'free' }).primaryLabel,
    'Start free'
  );
});

test('start router sends accountability answers to Cell', () => {
  const key = getRouteKey({
    project: 'personal',
    stage: 'idea',
    support: 'community',
  });

  assert.equal(key, 'cell');
  assert.match(
    getRecommendation({ project: 'personal', stage: 'idea', support: 'community' }).plan,
    /Family & Friends \$5/
  );
  assert.equal(
    getRecommendation({ project: 'personal', stage: 'idea', support: 'community' }).primaryLabel,
    'Continue with $5 plan'
  );
});

test('start router sends direct website or partly built projects to Founder', () => {
  assert.equal(
    getRouteKey({ project: 'website', stage: 'idea', support: 'direct' }),
    'founder'
  );
  assert.equal(
    getRouteKey({ project: 'personal', stage: 'partly-built', support: 'direct' }),
    'founder'
  );
});

test('start router sends direct workflow or rescue projects to Builder', () => {
  assert.equal(
    getRouteKey({ project: 'workflow', stage: 'idea', support: 'direct' }),
    'builder'
  );
  assert.equal(
    getRouteKey({ project: 'website', stage: 'stuck', support: 'direct' }),
    'builder'
  );
});

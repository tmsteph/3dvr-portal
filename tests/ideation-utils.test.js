import assert from 'node:assert/strict';
import test from 'node:test';
import { buildIdeaPrompt, shouldAllowRequest, splitIdeas } from '../social/ideation-utils.js';

test('shouldAllowRequest enforces minimum interval', () => {
  const now = 20000;
  const result = shouldAllowRequest(10000, now, 15000);
  assert.equal(result.allowed, false);
  assert.equal(result.remainingMs, 5000);
  const ok = shouldAllowRequest(0, now, 10000);
  assert.equal(ok.allowed, true);
});

test('buildIdeaPrompt includes provided fields', () => {
  const prompt = buildIdeaPrompt({
    goal: 'Grow sign-ups',
    audience: 'Founders',
    platforms: 'LinkedIn',
    tone: 'Confident',
    format: 'Carousel'
  });
  assert.match(prompt, /Goal: Grow sign-ups/);
  assert.match(prompt, /Audience: Founders/);
  assert.match(prompt, /Platforms: LinkedIn/);
  assert.match(prompt, /Tone: Confident/);
  assert.match(prompt, /Content formats: Carousel/);
});

test('splitIdeas extracts lines and strips bullets', () => {
  const input = '- Idea one\n2. Idea two\nIdea three';
  assert.deepEqual(splitIdeas(input), ['Idea one', 'Idea two', 'Idea three']);
});

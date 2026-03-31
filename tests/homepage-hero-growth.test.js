import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computeStats,
  normalizeConfig,
  pickRecommendedWinner,
  summarizeStats,
} from '../src/growth/homepage-hero.js';

test('homepage hero growth stats count only homepage entries with valid variants', () => {
  const stats = computeStats(
    {
      a: { page: 'homepage', variant: 'clarity', eventType: 'view' },
      b: { page: 'homepage', variant: 'clarity', eventType: 'cta-click' },
      c: { page: 'homepage', variant: 'traction', eventType: 'view' },
      d: { page: 'other', variant: 'clarity', eventType: 'view' },
      e: { page: 'homepage', variant: 'unknown', eventType: 'view' },
    },
    {
      f: { page: 'homepage', variant: 'clarity', sentiment: 'clear' },
      g: { page: 'homepage', variant: 'traction', sentiment: 'unclear' },
      h: { page: 'pricing', variant: 'clarity', sentiment: 'clear' },
    }
  );

  assert.deepEqual(stats, {
    clarity: { views: 1, clicks: 1, clear: 1, unclear: 0 },
    traction: { views: 1, clicks: 0, clear: 0, unclear: 1 },
  });
  assert.deepEqual(summarizeStats(stats), {
    totalViews: 2,
    totalClicks: 1,
    totalFeedback: 2,
  });
});

test('homepage hero winner requires enough views and a meaningful score gap', () => {
  const winner = pickRecommendedWinner({
    clarity: { views: 8, clicks: 4, clear: 4, unclear: 0 },
    traction: { views: 8, clicks: 1, clear: 1, unclear: 3 },
  });
  const noWinner = pickRecommendedWinner({
    clarity: { views: 4, clicks: 3, clear: 2, unclear: 0 },
    traction: { views: 7, clicks: 2, clear: 2, unclear: 1 },
  });

  assert.equal(winner?.key, 'clarity');
  assert.match(winner?.reason || '', /Auto-promoted clarity/i);
  assert.equal(noWinner, null);
});

test('homepage hero config normalization preserves updatedBy and safe defaults', () => {
  assert.deepEqual(normalizeConfig({}), {
    autoMode: true,
    winner: '',
    winnerReason: '',
    clarityWeight: 50,
    tractionWeight: 50,
    updatedAt: '',
    updatedBy: '',
  });

  assert.deepEqual(normalizeConfig({
    autoMode: false,
    winner: 'clarity',
    winnerReason: 'Manual override.',
    clarityWeight: '70',
    tractionWeight: '30',
    updatedAt: '2026-03-31T00:00:00.000Z',
    updatedBy: 'growth-cron',
  }), {
    autoMode: false,
    winner: 'clarity',
    winnerReason: 'Manual override.',
    clarityWeight: 70,
    tractionWeight: 30,
    updatedAt: '2026-03-31T00:00:00.000Z',
    updatedBy: 'growth-cron',
  });
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { runHomepageHeroCronCycle } from '../src/growth/homepage-hero-cron.js';

function createClient(overrides = {}) {
  const writes = [];
  const client = {
    async readConfig() {
      return {
        autoMode: true,
        winner: '',
        winnerReason: '',
        clarityWeight: 50,
        tractionWeight: 50,
        updatedAt: '',
        updatedBy: '',
        ...(overrides.config || {}),
      };
    },
    async readEvents() {
      return overrides.events || {};
    },
    async readFeedback() {
      return overrides.feedback || {};
    },
    async writeConfig(value) {
      writes.push(value);
    },
  };

  return { client, writes };
}

test('homepage hero cron promotes the recommended winner when auto mode is enabled', async () => {
  const { client, writes } = createClient({
    events: {
      v1: { id: 'v1', page: 'homepage', variant: 'clarity', eventType: 'view' },
      v2: { id: 'v2', page: 'homepage', variant: 'clarity', eventType: 'view' },
      v3: { id: 'v3', page: 'homepage', variant: 'clarity', eventType: 'view' },
      v4: { id: 'v4', page: 'homepage', variant: 'clarity', eventType: 'view' },
      v5: { id: 'v5', page: 'homepage', variant: 'clarity', eventType: 'view' },
      v6: { id: 'v6', page: 'homepage', variant: 'clarity', eventType: 'view' },
      c1: { id: 'c1', page: 'homepage', variant: 'clarity', eventType: 'cta-click' },
      c2: { id: 'c2', page: 'homepage', variant: 'clarity', eventType: 'cta-click' },
      t1: { id: 't1', page: 'homepage', variant: 'traction', eventType: 'view' },
      t2: { id: 't2', page: 'homepage', variant: 'traction', eventType: 'view' },
      t3: { id: 't3', page: 'homepage', variant: 'traction', eventType: 'view' },
      t4: { id: 't4', page: 'homepage', variant: 'traction', eventType: 'view' },
      t5: { id: 't5', page: 'homepage', variant: 'traction', eventType: 'view' },
      t6: { id: 't6', page: 'homepage', variant: 'traction', eventType: 'view' },
    },
    feedback: {
      f1: { id: 'f1', page: 'homepage', variant: 'clarity', sentiment: 'clear' },
      f2: { id: 'f2', page: 'homepage', variant: 'clarity', sentiment: 'clear' },
      f3: { id: 'f3', page: 'homepage', variant: 'traction', sentiment: 'unclear' },
      f4: { id: 'f4', page: 'homepage', variant: 'traction', sentiment: 'unclear' },
    },
  });

  const result = await runHomepageHeroCronCycle({
    client,
    now: () => '2026-03-31T12:00:00.000Z',
  });

  assert.equal(result.promoted, true);
  assert.equal(result.wouldPromote, true);
  assert.equal(result.action, 'promoted');
  assert.equal(result.winnerAfter, 'clarity');
  assert.equal(writes.length, 1);
  assert.equal(writes[0].winner, 'clarity');
  assert.equal(writes[0].updatedBy, 'growth-cron');
});

test('homepage hero cron dry run reports the winner without writing config', async () => {
  const { client, writes } = createClient({
    events: {
      c1: { id: 'c1', page: 'homepage', variant: 'clarity', eventType: 'view' },
      c2: { id: 'c2', page: 'homepage', variant: 'clarity', eventType: 'view' },
      c3: { id: 'c3', page: 'homepage', variant: 'clarity', eventType: 'view' },
      c4: { id: 'c4', page: 'homepage', variant: 'clarity', eventType: 'view' },
      c5: { id: 'c5', page: 'homepage', variant: 'clarity', eventType: 'view' },
      c6: { id: 'c6', page: 'homepage', variant: 'clarity', eventType: 'view' },
      c7: { id: 'c7', page: 'homepage', variant: 'clarity', eventType: 'cta-click' },
      t1: { id: 't1', page: 'homepage', variant: 'traction', eventType: 'view' },
      t2: { id: 't2', page: 'homepage', variant: 'traction', eventType: 'view' },
      t3: { id: 't3', page: 'homepage', variant: 'traction', eventType: 'view' },
      t4: { id: 't4', page: 'homepage', variant: 'traction', eventType: 'view' },
      t5: { id: 't5', page: 'homepage', variant: 'traction', eventType: 'view' },
      t6: { id: 't6', page: 'homepage', variant: 'traction', eventType: 'view' },
    },
    feedback: {
      f1: { id: 'f1', page: 'homepage', variant: 'clarity', sentiment: 'clear' },
      f2: { id: 'f2', page: 'homepage', variant: 'clarity', sentiment: 'clear' },
      f3: { id: 'f3', page: 'homepage', variant: 'traction', sentiment: 'unclear' },
    },
  });

  const result = await runHomepageHeroCronCycle({
    client,
    dryRun: true,
    now: () => '2026-03-31T12:00:00.000Z',
  });

  assert.equal(result.promoted, false);
  assert.equal(result.wouldPromote, true);
  assert.equal(result.action, 'dry-run');
  assert.equal(result.recommendedWinner, 'clarity');
  assert.equal(writes.length, 0);
});

test('homepage hero cron respects manual mode and leaves the winner unchanged', async () => {
  const { client, writes } = createClient({
    config: {
      autoMode: false,
      winner: 'traction',
      winnerReason: 'Manual promote from Growth Lab.',
      updatedBy: 'growth-lab',
    },
  });

  const result = await runHomepageHeroCronCycle({
    client,
    now: () => '2026-03-31T12:00:00.000Z',
  });

  assert.equal(result.promoted, false);
  assert.equal(result.wouldPromote, false);
  assert.equal(result.action, 'auto-mode-disabled');
  assert.equal(result.winnerAfter, 'traction');
  assert.equal(writes.length, 0);
});

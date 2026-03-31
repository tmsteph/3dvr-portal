import assert from 'node:assert/strict';
import test from 'node:test';
import { createHomepageHeroGrowthCronHandler } from '../api/growth/homepage-hero-cron.js';

function createMockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    setHeader(key, value) {
      this.headers[key] = value;
    }
  };
}

test('homepage growth cron handler only allows GET', async () => {
  const handler = createHomepageHeroGrowthCronHandler({
    config: {
      GROWTH_HOMEPAGE_CRON_ENABLED: 'true',
      GROWTH_HOMEPAGE_CRON_SECRET: 'cron-secret'
    },
    runCycleImpl: async () => ({})
  });

  const req = { method: 'POST', headers: {} };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 405);
  assert.deepEqual(res.body, { error: 'Method Not Allowed' });
});

test('homepage growth cron handler rejects when cron mode is disabled', async () => {
  const handler = createHomepageHeroGrowthCronHandler({
    config: {
      GROWTH_HOMEPAGE_CRON_ENABLED: 'false',
      GROWTH_HOMEPAGE_CRON_SECRET: 'cron-secret'
    },
    runCycleImpl: async () => ({})
  });

  const req = { method: 'GET', headers: { Authorization: 'Bearer cron-secret' } };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 403);
  assert.match(res.body.error, /cron is disabled/i);
});

test('homepage growth cron handler requires bearer secret', async () => {
  const handler = createHomepageHeroGrowthCronHandler({
    config: {
      GROWTH_HOMEPAGE_CRON_ENABLED: 'true',
      GROWTH_HOMEPAGE_CRON_SECRET: 'cron-secret'
    },
    runCycleImpl: async () => ({})
  });

  const req = { method: 'GET', headers: { Authorization: 'Bearer wrong-secret' } };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 401);
  assert.match(res.body.error, /Unauthorized cron trigger/i);
});

test('homepage growth cron handler runs the cycle and returns diagnostics', async () => {
  let receivedPayload = null;

  const handler = createHomepageHeroGrowthCronHandler({
    config: {
      GROWTH_HOMEPAGE_CRON_ENABLED: 'true',
      CRON_SECRET: 'cron-secret',
      GROWTH_HOMEPAGE_CRON_DRY_RUN: 'false',
      GROWTH_GUN_PEERS: 'wss://relay.3dvr.tech/gun'
    },
    runCycleImpl: async (payload) => {
      receivedPayload = payload;
      return {
        experiment: 'homepage-hero',
        generatedAt: '2026-03-31T12:00:00.000Z',
        dryRun: true,
        autoMode: true,
        winnerBefore: '',
        winnerAfter: '',
        recommendedWinner: 'clarity',
        recommendedReason: 'Auto-promoted clarity from stronger click and clarity signals.',
        updatedBy: '',
        wouldPromote: true,
        promoted: false,
        action: 'dry-run',
        stats: {
          clarity: { views: 6, clicks: 2, clear: 2, unclear: 0 },
          traction: { views: 6, clicks: 1, clear: 1, unclear: 2 },
        },
        totals: {
          totalViews: 12,
          totalClicks: 3,
          totalFeedback: 5,
        },
        reason: 'Auto-promoted clarity from stronger click and clarity signals.',
      };
    }
  });

  const req = {
    method: 'GET',
    query: { dryRun: 'true' },
    headers: { Authorization: 'Bearer cron-secret' }
  };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(receivedPayload.dryRun, true);
  assert.equal(receivedPayload.gunPeers, 'wss://relay.3dvr.tech/gun');
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.mode, 'cron');
  assert.equal(res.body.experiment, 'homepage-hero');
  assert.equal(res.body.recommendedWinner, 'clarity');
  assert.equal(res.body.action, 'dry-run');
  assert.equal(res.body.totals.totalViews, 12);
});

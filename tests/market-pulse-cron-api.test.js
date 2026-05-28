import assert from 'node:assert/strict';
import test from 'node:test';
import { createMarketPulseCronHandler } from '../api/growth/market-pulse-cron.js';

function createResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(key, value) {
      this.headers[key] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

test('market pulse cron handler only allows GET', async () => {
  const handler = createMarketPulseCronHandler({
    config: {
      GROWTH_MARKET_PULSE_CRON_ENABLED: 'true',
      GROWTH_MARKET_PULSE_CRON_SECRET: 'cron-secret',
    },
  });
  const res = createResponse();

  await handler({ method: 'POST', headers: {} }, res);

  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.Allow, 'GET');
});

test('market pulse cron handler rejects disabled cron', async () => {
  const handler = createMarketPulseCronHandler({
    config: {
      GROWTH_MARKET_PULSE_CRON_ENABLED: 'false',
      GROWTH_MARKET_PULSE_CRON_SECRET: 'cron-secret',
    },
  });
  const res = createResponse();

  await handler({ method: 'GET', headers: { Authorization: 'Bearer cron-secret' } }, res);

  assert.equal(res.statusCode, 403);
  assert.match(res.body.error, /cron is disabled/i);
});

test('market pulse cron handler requires bearer secret', async () => {
  const handler = createMarketPulseCronHandler({
    config: {
      GROWTH_MARKET_PULSE_CRON_ENABLED: 'true',
      GROWTH_MARKET_PULSE_CRON_SECRET: 'cron-secret',
    },
  });
  const res = createResponse();

  await handler({ method: 'GET', headers: {} }, res);

  assert.equal(res.statusCode, 401);
  assert.match(res.body.error, /Unauthorized cron trigger/i);
});

test('market pulse cron handler runs cycle with query overrides', async () => {
  const handler = createMarketPulseCronHandler({
    config: {
      CRON_SECRET: 'cron-secret',
      GROWTH_MARKET_PULSE_CRON_ENABLED: 'true',
    },
    async runCycleImpl(options) {
      assert.equal(options.market, 'professional services');
      assert.equal(options.keywords, 'lead follow up,client onboarding');
      assert.equal(options.dryRun, true);
      return {
        runId: 'market-pulse-1',
        generatedAt: '2026-05-14T10:00:00.000Z',
        dryRun: true,
        profile: {
          market: 'professional services',
        },
        signalsAnalyzed: 3,
        topOpportunity: { title: 'Lead follow-up lane' },
        directoryListings: [{ id: 'listing-1', approved: true }],
        outreachDrafts: [{ id: 'draft-1' }],
        tests: [{ id: 'test-1' }],
        approvalsRequired: 2,
        persist: { skipped: true, reason: 'dry run' },
        warnings: [],
      };
    },
  });
  const res = createResponse();

  await handler({
    method: 'GET',
    query: {
      dryRun: 'true',
      market: 'professional services',
      keywords: 'lead follow up,client onboarding',
    },
    headers: { Authorization: 'Bearer cron-secret' },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.mode, 'cron');
  assert.equal(res.body.runId, 'market-pulse-1');
  assert.equal(res.body.outreachDraftCount, 1);
  assert.equal(res.body.testCount, 1);
});


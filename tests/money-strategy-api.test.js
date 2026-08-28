import assert from 'node:assert/strict';
import test from 'node:test';
import { createMoneyLoopHandler } from '../api/money/loop.js';

function createMockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
    setHeader(key, value) { this.headers[key] = value; }
  };
}

test('money strategy endpoint requires its scoped bearer token', async () => {
  const handler = createMoneyLoopHandler({
    config: { MONEY_STRATEGY_TOKEN: 'strategy-secret' },
    runAutopilotImpl: async () => ({})
  });
  const res = createMockRes();
  await handler({ method: 'GET', query: { mode: 'strategy' }, headers: { authorization: 'Bearer wrong' } }, res);
  assert.equal(res.statusCode, 401);
  assert.match(res.body.error, /Unauthorized money strategy/);
});

test('money strategy endpoint forces a read-only autopilot cycle', async () => {
  let received = null;
  const handler = createMoneyLoopHandler({
    config: { MONEY_STRATEGY_TOKEN: 'strategy-secret' },
    stripeClient: { checkout: { sessions: { list() {} } } },
    runAutopilotImpl: async payload => {
      received = payload;
      return {
        runId: 'money-safe-1', generatedAt: '2026-08-28T08:00:00Z',
        market: 'local services', keywords: ['websites'], analytics: { enabled: true },
        revenue: { enabled: true, byOffer: [] },
        offerSelection: { profile: 'free-page-starter', source: 'fallback' },
        topOpportunity: { title: '3DVR Free Page' },
        monetization: { checkoutUrl: 'https://example.com/checkout' }, warnings: []
      };
    }
  });
  const res = createMockRes();
  await handler({ method: 'GET', query: { mode: 'strategy' }, headers: { authorization: 'Bearer strategy-secret' } }, res);

  assert.equal(received.dryRun, true);
  assert.equal(received.publishEnabled, false);
  assert.equal(received.vercelDeploy, false);
  assert.equal(received.promotionEnabled, false);
  assert.equal(received.autoDiscover, true);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.mode, 'strategy-read');
  assert.equal(res.body.offerSelection.profile, 'free-page-starter');
});

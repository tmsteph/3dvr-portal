import assert from 'node:assert/strict';
import test from 'node:test';
import { createMoneyAutopilotCronHandler } from '../api/money/autopilot-cron.js';

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

test('money autopilot cron handler only allows GET', async () => {
  const handler = createMoneyAutopilotCronHandler({
    config: {
      MONEY_AUTOPILOT_CRON_ENABLED: 'true',
      MONEY_AUTOPILOT_CRON_SECRET: 'cron-secret'
    },
    runAutopilotImpl: async () => ({})
  });

  const req = { method: 'POST', headers: {} };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 405);
  assert.deepEqual(res.body, { error: 'Method Not Allowed' });
});

test('money autopilot cron handler rejects when cron mode is disabled', async () => {
  const handler = createMoneyAutopilotCronHandler({
    config: {
      MONEY_AUTOPILOT_CRON_ENABLED: 'false',
      MONEY_AUTOPILOT_CRON_SECRET: 'cron-secret'
    },
    runAutopilotImpl: async () => ({})
  });

  const req = { method: 'GET', headers: { Authorization: 'Bearer cron-secret' } };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 403);
  assert.match(res.body.error, /cron is disabled/i);
});

test('money autopilot cron handler requires bearer secret', async () => {
  const handler = createMoneyAutopilotCronHandler({
    config: {
      MONEY_AUTOPILOT_CRON_ENABLED: 'true',
      MONEY_AUTOPILOT_CRON_SECRET: 'cron-secret'
    },
    runAutopilotImpl: async () => ({})
  });

  const req = { method: 'GET', headers: { Authorization: 'Bearer wrong-secret' } };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 401);
  assert.match(res.body.error, /Unauthorized cron trigger/i);
});

test('money autopilot cron handler runs cycle with query overrides', async () => {
  let receivedPayload = null;

  const handler = createMoneyAutopilotCronHandler({
    config: {
      MONEY_AUTOPILOT_CRON_ENABLED: 'true',
      CRON_SECRET: 'cron-secret',
      MONEY_AUTOPILOT_CRON_DRY_RUN: 'true'
    },
    runAutopilotImpl: async payload => {
      receivedPayload = payload;
      return {
        runId: 'cron-run-1',
        generatedAt: '2026-02-15T00:00:00.000Z',
        topOpportunity: { id: 'op-1', title: 'Autopilot Offer' },
        signalsAnalyzed: 12,
        publish: { destinationUrl: 'https://example.com/offer' },
        promotion: { dispatched: false, reason: 'disabled' },
        monetization: {
          checkoutConfigured: true,
          checkoutUrl: 'https://buy.stripe.com/example123',
          checkoutCtaLabel: 'Start Paid Plan'
        },
        warnings: []
      };
    }
  });

  const req = {
    method: 'GET',
    query: {
      dryRun: 'false',
      autoDiscover: 'false',
      publish: 'true',
      vercelDeploy: 'true',
      promotion: 'true'
    },
    headers: { Authorization: 'Bearer cron-secret' }
  };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(receivedPayload.dryRun, false);
  assert.equal(receivedPayload.autoDiscover, false);
  assert.equal(receivedPayload.publishEnabled, true);
  assert.equal(receivedPayload.vercelDeploy, true);
  assert.equal(receivedPayload.promotionEnabled, true);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.mode, 'cron');
  assert.equal(res.body.runId, 'cron-run-1');
  assert.equal(res.body.signalsAnalyzed, 12);
  assert.equal(res.body.monetization.checkoutConfigured, true);
});


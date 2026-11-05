import assert from 'node:assert/strict';
import test from 'node:test';
import { createMoneyAutopilotCronHandler } from '../src/money/autopilot-cron-handler.js';

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

test('money autopilot cron refuses a direct request without separate run authorization', async () => {
  let executions = 0;
  const handler = createMoneyAutopilotCronHandler({
    config: {
      MONEY_AUTOPILOT_CRON_ENABLED: 'true',
      MONEY_AUTOPILOT_CRON_SECRET: 'cron-secret'
    },
    runAutopilotImpl: async () => { executions += 1; return {}; }
  });

  const res = createMockRes();
  await handler({
    method: 'GET',
    query: { dryRun: 'false', publish: 'true', promotion: 'true' },
    headers: { Authorization: 'Bearer cron-secret' }
  }, res);

  assert.equal(res.statusCode, 403);
  assert.match(res.body.error, /run authorization/i);
  assert.equal(executions, 0);
});

test('money autopilot cron handler requires bearer secret', async () => {
  const handler = createMoneyAutopilotCronHandler({
    config: {
      MONEY_AUTOPILOT_CRON_ENABLED: 'true',
      MONEY_AUTOPILOT_CRON_RUN_AUTHORIZED: 'true',
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

test('money autopilot cron rejects raw secrets and malformed authorization schemes', async () => {
  let executions = 0;
  const handler = createMoneyAutopilotCronHandler({
    config: {
      MONEY_AUTOPILOT_CRON_ENABLED: 'true',
      MONEY_AUTOPILOT_CRON_RUN_AUTHORIZED: 'true',
      MONEY_AUTOPILOT_CRON_SECRET: 'cron-secret'
    },
    runAutopilotImpl: async () => { executions += 1; return {}; }
  });

  for (const authorization of [
    'cron-secret',
    'Basic cron-secret',
    'Bearercron-secret',
    'Bearer cron-secret extra',
    'Bearer',
    'Bearer cron-secret\\nOther: header'
  ]) {
    const res = createMockRes();
    await handler({ method: 'GET', headers: { Authorization: authorization } }, res);
    assert.equal(res.statusCode, 401, authorization);
  }
  assert.equal(executions, 0);
});

test('money autopilot cron forces bounded no-send dry-run despite unsafe query overrides', async () => {
  let receivedPayload = null;

  const handler = createMoneyAutopilotCronHandler({
    config: {
      MONEY_AUTOPILOT_CRON_ENABLED: 'true',
      MONEY_AUTOPILOT_CRON_RUN_AUTHORIZED: 'true',
      CRON_SECRET: 'cron-secret',
      MONEY_AUTOPILOT_CRON_DRY_RUN: 'true'
    },
    // A research-only cron must never receive a privileged Stripe client.
    stripeClient: { customers: { list: () => { throw new Error('Stripe access forbidden in cron'); } } },
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
      autoDiscover: 'true', // must not force an extra network discovery pass
      publish: 'true',
      vercelDeploy: 'true',
      promotion: 'true'
    },
    headers: { Authorization: 'Bearer cron-secret' }
  };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(receivedPayload.dryRun, true);
  assert.equal(receivedPayload.disablePaidAi, true);
  assert.equal(receivedPayload.disableAuthenticatedReads, true);
  assert.equal(Object.hasOwn(receivedPayload, 'stripeClient'), false);
  assert.equal(receivedPayload.autoDiscover, false);
  assert.equal(receivedPayload.publishEnabled, false);
  assert.equal(receivedPayload.vercelDeploy, false);
  assert.equal(receivedPayload.promotionEnabled, false);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.mode, 'cron');
  assert.equal(res.body.runId, 'cron-run-1');
  assert.equal(res.body.signalsAnalyzed, 12);
  assert.equal(res.body.monetization.checkoutConfigured, true);
});

test('money autopilot cron releases in-flight guard after an execution error', async () => {
  let executions = 0;
  const handler = createMoneyAutopilotCronHandler({
    config: {
      MONEY_AUTOPILOT_CRON_ENABLED: 'true',
      MONEY_AUTOPILOT_CRON_RUN_AUTHORIZED: 'true',
      CRON_SECRET: 'cron-secret'
    },
    runAutopilotImpl: async () => {
      executions += 1;
      if (executions === 1) throw new Error('synthetic upstream failure');
      return { runId: 'recovered-cron', warnings: [] };
    }
  });
  const req = { method: 'GET', headers: { Authorization: 'Bearer cron-secret' } };

  const failed = createMockRes();
  await handler(req, failed);
  assert.equal(failed.statusCode, 500);
  assert.match(failed.body.error, /synthetic upstream failure/);

  const retried = createMockRes();
  await handler(req, retried);
  assert.equal(retried.statusCode, 200);
  assert.equal(retried.body.runId, 'recovered-cron');
  assert.equal(executions, 2);
});

test('money autopilot cron rejects overlapping calls and permits a later retry', async () => {
  let resolveRun;
  let executions = 0;
  const handler = createMoneyAutopilotCronHandler({
    config: {
      MONEY_AUTOPILOT_CRON_ENABLED: 'true',
      MONEY_AUTOPILOT_CRON_RUN_AUTHORIZED: 'true',
      CRON_SECRET: 'cron-secret'
    },
    runAutopilotImpl: async () => {
      executions += 1;
      if (executions === 1) {
        await new Promise(resolve => { resolveRun = resolve; });
      }
      return { runId: 'bounded-cron', warnings: [] };
    }
  });
  const req = { method: 'GET', headers: { Authorization: 'Bearer cron-secret' } };
  const first = createMockRes();
  const firstRun = handler(req, first);
  assert.equal(executions, 1);

  const overlap = createMockRes();
  await handler(req, overlap);
  assert.equal(overlap.statusCode, 409);
  assert.match(overlap.body.error, /already running/i);
  assert.equal(executions, 1);

  resolveRun();
  await firstRun;
  assert.equal(first.statusCode, 200);

  const later = createMockRes();
  await handler(req, later);
  assert.equal(later.statusCode, 200);
  assert.equal(executions, 2);
});

test('money cron never presents a zero-signal fallback as verified demand', async () => {
  const handler = createMoneyAutopilotCronHandler({
    config: {
      MONEY_AUTOPILOT_CRON_ENABLED: 'true',
      MONEY_AUTOPILOT_CRON_RUN_AUTHORIZED: 'true',
      CRON_SECRET: 'cron-secret'
    },
    runAutopilotImpl: async () => ({
      runId: 'synthetic-no-signals',
      signalsAnalyzed: 0,
      topOpportunity: { title: 'Generic fallback', evidence: ['Fallback opportunity generated without external demand signals.'] },
      warnings: ['Demand sources unavailable']
    })
  });

  const res = createMockRes();
  await handler({ method: 'GET', headers: { Authorization: 'Bearer cron-secret' } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.signalsAnalyzed, 0);
  assert.equal(res.body.topOpportunity, null);
  assert.deepEqual(res.body.warnings, ['Demand sources unavailable']);
});

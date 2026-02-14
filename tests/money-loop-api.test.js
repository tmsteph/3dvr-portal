import assert from 'node:assert/strict';
import test from 'node:test';
import { createMoneyLoopHandler } from '../api/money/loop.js';
import { issueUserToken } from '../src/money/access.js';

function createMockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    ended: false,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    end(payload) {
      this.ended = true;
      this.body = payload ?? this.body;
      return this;
    },
    setHeader(key, value) {
      this.headers[key] = value;
    }
  };
}

function createConfig(overrides = {}) {
  return {
    MONEY_AUTOPILOT_TOKEN: 'admin-token',
    MONEY_AUTOPILOT_USER_TOKEN_SECRET: 'user-secret',
    MONEY_AUTOPILOT_REQUIRE_USER_TOKEN: 'false',
    MONEY_AUTOPILOT_RATE_LIMITS: JSON.stringify({
      free: { minute: 1, day: 2 },
      starter: { minute: 2, day: 10 },
      pro: { minute: 5, day: 50 },
      admin: { minute: 9999, day: 9999 }
    }),
    ...overrides
  };
}

function createUserBearer({ email = 'user@example.com', plan = 'starter', secret = 'user-secret' } = {}) {
  const issued = issueUserToken({ email, plan, secret, ttlSeconds: 3600, now: Date.now() });
  return issued.token;
}

test('money loop handler replies to OPTIONS', async () => {
  let called = false;
  const handler = createMoneyLoopHandler({
    config: createConfig(),
    runLoopImpl: async () => {
      called = true;
      return {};
    }
  });

  const req = { method: 'OPTIONS', body: {} };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.ended, true);
  assert.equal(called, false);
});

test('money loop handler can issue user token from entitlement check', async () => {
  const handler = createMoneyLoopHandler({
    config: createConfig(),
    resolveEntitlementImpl: async () => ({
      ok: true,
      plan: 'pro',
      email: 'paid@example.com',
      source: 'stripe',
      customerId: 'cus_123',
      subscriptionId: 'sub_123'
    })
  });

  const req = {
    method: 'POST',
    body: { mode: 'token', email: 'paid@example.com' },
    headers: {}
  };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.plan, 'pro');
  assert.equal(typeof res.body.token, 'string');
});

test('money loop handler rejects invalid market payload', async () => {
  const handler = createMoneyLoopHandler({ config: createConfig(), runLoopImpl: async () => ({}) });

  const req = { method: 'POST', body: { market: 55 }, headers: {} };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: 'market must be a string when provided.' });
});

test('money loop handler returns run payload and rate limits for user token', async () => {
  const handler = createMoneyLoopHandler({
    config: createConfig(),
    runLoopImpl: async payload => ({
      runId: payload.runId || 'money-123',
      generatedAt: '2026-02-13T00:00:00.000Z',
      usedOpenAi: false,
      input: { market: payload.market || 'x' },
      warnings: [],
      signals: [],
      opportunities: [],
      topOpportunity: null,
      adDrafts: [],
      executionChecklist: [],
      monetization: {},
      monetizationNotes: []
    })
  });

  const token = createUserBearer();
  const req = {
    method: 'POST',
    body: { market: 'solo founders' },
    headers: { Authorization: `Bearer ${token}` }
  };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.runId, 'money-123');
  assert.equal(res.body.actor.plan, 'starter');
  assert.equal(typeof res.body.createdAt, 'number');
  assert.ok(res.body.rateLimit);
});

test('money loop handler enforces required user token when configured', async () => {
  const handler = createMoneyLoopHandler({
    config: createConfig({ MONEY_AUTOPILOT_REQUIRE_USER_TOKEN: 'true' }),
    runLoopImpl: async () => ({})
  });

  const req = { method: 'POST', body: { market: 'solo founders' }, headers: {} };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 401);
  assert.match(res.body.error, /valid user token is required/i);
});

test('money loop handler GET without autopilot mode returns endpoint metadata', async () => {
  const handler = createMoneyLoopHandler({ config: createConfig(), runLoopImpl: async () => ({}) });
  const req = { method: 'GET', query: {}, headers: {} };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    ok: true,
    endpoint: 'money-loop',
    methods: ['POST', 'GET?mode=autopilot']
  });
});

test('money loop handler blocks autopilot trigger without valid token', async () => {
  const handler = createMoneyLoopHandler({
    config: createConfig(),
    runAutopilotImpl: async () => ({ runId: 'auto-1' })
  });
  const req = { method: 'GET', query: { mode: 'autopilot' }, headers: {} };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 401);
  assert.match(res.body.error, /Unauthorized autopilot trigger/i);
});

test('money loop handler runs autopilot with valid admin token', async () => {
  const handler = createMoneyLoopHandler({
    config: createConfig(),
    runAutopilotImpl: async payload => ({
      runId: 'auto-1',
      generatedAt: '2026-02-13T00:00:00.000Z',
      publish: { destinationUrl: '', github: { reason: 'disabled' }, vercel: { reason: 'disabled' } },
      promotion: { reason: 'disabled' },
      topOpportunity: null,
      warnings: [],
      signalsAnalyzed: 0,
      receivedDryRun: payload.dryRun,
      receivedAutoDiscover: payload.autoDiscover,
      receivedPublish: payload.publishEnabled,
      receivedChannels: payload.channels
    })
  });

  const req = {
    method: 'GET',
    query: {
      mode: 'autopilot',
      dryRun: 'true',
      autoDiscover: 'false',
      publish: 'true',
      channels: 'reddit,x'
    },
    headers: { 'x-autopilot-token': 'admin-token' }
  };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.mode, 'autopilot');
  assert.equal(res.body.runId, 'auto-1');
  assert.equal(res.body.receivedDryRun, true);
  assert.equal(res.body.receivedAutoDiscover, false);
  assert.equal(res.body.receivedPublish, true);
  assert.deepEqual(res.body.receivedChannels, ['reddit', 'x']);
});

test('money loop handler applies per-user rate limits on autopilot runs', async () => {
  const handler = createMoneyLoopHandler({
    config: createConfig({
      MONEY_AUTOPILOT_RATE_LIMITS: JSON.stringify({
        free: { minute: 1, day: 1 },
        starter: { minute: 1, day: 1 },
        pro: { minute: 1, day: 1 },
        admin: { minute: 9999, day: 9999 }
      })
    }),
    runAutopilotImpl: async () => ({
      runId: 'auto-limit',
      generatedAt: '2026-02-13T00:00:00.000Z',
      publish: { destinationUrl: '', github: { reason: 'disabled' }, vercel: { reason: 'disabled' } },
      promotion: { reason: 'disabled' },
      topOpportunity: null,
      warnings: [],
      signalsAnalyzed: 0
    })
  });

  const token = createUserBearer({ email: 'limited@example.com', plan: 'starter' });

  const firstReq = {
    method: 'GET',
    query: { mode: 'autopilot' },
    headers: { Authorization: `Bearer ${token}` }
  };
  const firstRes = createMockRes();
  await handler(firstReq, firstRes);
  assert.equal(firstRes.statusCode, 200);

  const secondReq = {
    method: 'GET',
    query: { mode: 'autopilot' },
    headers: { Authorization: `Bearer ${token}` }
  };
  const secondRes = createMockRes();
  await handler(secondReq, secondRes);

  assert.equal(secondRes.statusCode, 429);
  assert.match(secondRes.body.error, /Rate limit exceeded/i);
});

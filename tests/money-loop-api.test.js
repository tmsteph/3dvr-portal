import assert from 'node:assert/strict';
import test from 'node:test';
import { createMoneyLoopHandler } from '../api/money/loop.js';

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

test('money loop handler replies to OPTIONS', async () => {
  let called = false;
  const handler = createMoneyLoopHandler({
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

test('money loop handler rejects non-string market', async () => {
  const handler = createMoneyLoopHandler({ runLoopImpl: async () => ({}) });

  const req = { method: 'POST', body: { market: 55 } };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: 'market must be a string when provided.' });
});

test('money loop handler returns run payload', async () => {
  const handler = createMoneyLoopHandler({
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

  const req = { method: 'POST', body: { market: 'solo founders' } };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.runId, 'money-123');
  assert.equal(typeof res.body.createdAt, 'number');
});

test('money loop handler GET without autopilot mode returns endpoint metadata', async () => {
  const handler = createMoneyLoopHandler({ runLoopImpl: async () => ({}) });
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

test('money loop handler blocks autopilot trigger without token config', async () => {
  const previous = process.env.MONEY_AUTOPILOT_TOKEN;
  delete process.env.MONEY_AUTOPILOT_TOKEN;

  const handler = createMoneyLoopHandler({
    runAutopilotImpl: async () => ({ runId: 'auto-1' })
  });
  const req = { method: 'GET', query: { mode: 'autopilot' }, headers: {} };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: 'MONEY_AUTOPILOT_TOKEN is not configured.' });

  if (previous === undefined) {
    delete process.env.MONEY_AUTOPILOT_TOKEN;
  } else {
    process.env.MONEY_AUTOPILOT_TOKEN = previous;
  }
});

test('money loop handler runs autopilot with valid token', async () => {
  const previous = process.env.MONEY_AUTOPILOT_TOKEN;
  process.env.MONEY_AUTOPILOT_TOKEN = 'secret-token';

  const handler = createMoneyLoopHandler({
    runAutopilotImpl: async payload => ({
      runId: 'auto-1',
      generatedAt: '2026-02-13T00:00:00.000Z',
      publish: { attempted: false, published: false, reason: 'publish disabled' },
      topOpportunity: null,
      warnings: [],
      signalsAnalyzed: 0,
      receivedDryRun: payload.dryRun
    })
  });

  const req = {
    method: 'GET',
    query: { mode: 'autopilot', dryRun: 'true' },
    headers: { 'x-autopilot-token': 'secret-token' }
  };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.mode, 'autopilot');
  assert.equal(res.body.runId, 'auto-1');
  assert.equal(res.body.receivedDryRun, true);

  if (previous === undefined) {
    delete process.env.MONEY_AUTOPILOT_TOKEN;
  } else {
    process.env.MONEY_AUTOPILOT_TOKEN = previous;
  }
});

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

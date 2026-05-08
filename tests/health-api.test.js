import assert from 'node:assert/strict';
import test from 'node:test';
import { createHealthHandler } from '../api/health.js';

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

test('health handler responds to GET with deployment metadata', async () => {
  const handler = createHealthHandler({
    config: {
      VERCEL_ENV: 'preview',
      VERCEL_GIT_COMMIT_SHA: 'abc123',
      VERCEL_GIT_COMMIT_REF: 'feature/api-health-skeleton'
    },
    now: () => new Date('2026-05-08T12:34:56.000Z')
  });
  const req = { method: 'GET', headers: {} };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    ok: true,
    service: '3dvr-portal',
    checkedAt: '2026-05-08T12:34:56.000Z',
    environment: 'preview',
    commitSha: 'abc123',
    branch: 'feature/api-health-skeleton'
  });
});

test('health handler rejects non-get methods', async () => {
  const handler = createHealthHandler();
  const req = { method: 'POST', headers: {} };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 405);
  assert.deepEqual(res.body, { error: 'Method Not Allowed' });
});

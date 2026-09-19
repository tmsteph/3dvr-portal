import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VERCEL_PORTAL_ORIGIN,
  fetchPortalJson,
  portalApiCandidates
} from '../campaigns/api.js';

test('Campaigns API candidates prefer the current portal then Vercel backup', () => {
  const urls = portalApiCandidates('/api/openai-site?provider=lead-finder', 'https://portal.3dvr.tech');
  assert.equal(urls.length, 2);
  assert.equal(urls[0], 'https://portal.3dvr.tech/api/openai-site?provider=lead-finder');
  assert.equal(urls[1], `${VERCEL_PORTAL_ORIGIN}/api/openai-site?provider=lead-finder`);
});

test('Campaigns retries the Vercel route after a network failure', async () => {
  const calls = [];
  const result = await fetchPortalJson('/api/test', {}, {
    currentOrigin: 'https://portal.3dvr.tech',
    fetchImpl: async url => {
      calls.push(url);
      if (calls.length === 1) throw new TypeError('Failed to fetch');
      return {
        status: 200,
        ok: true,
        json: async () => ({ ok: true })
      };
    }
  });

  assert.equal(calls.length, 2);
  assert.equal(result.usedFallback, true);
  assert.equal(result.payload.ok, true);
});

test('Campaigns retries 503 but does not bypass a 429 limit', async () => {
  const calls = [];
  const retry = await fetchPortalJson('/api/test', {}, {
    currentOrigin: 'https://portal.3dvr.tech',
    fetchImpl: async url => {
      calls.push(url);
      return calls.length === 1
        ? { status: 503, ok: false, json: async () => ({ error: 'edge unavailable' }) }
        : { status: 200, ok: true, json: async () => ({ ok: true }) };
    }
  });
  assert.equal(retry.usedFallback, true);

  const limitedCalls = [];
  const limited = await fetchPortalJson('/api/test', {}, {
    currentOrigin: 'https://portal.3dvr.tech',
    fetchImpl: async url => {
      limitedCalls.push(url);
      return { status: 429, ok: false, json: async () => ({ code: 'rate_limited' }) };
    }
  });

  assert.equal(limitedCalls.length, 1);
  assert.equal(limited.response.status, 429);
  assert.equal(limited.usedFallback, false);
});

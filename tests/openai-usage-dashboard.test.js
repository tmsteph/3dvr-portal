import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createOpenAiUsageHandler } from '../api/openai-usage.js';

function makeResponse() {
  const state = { statusCode: 200, body: null, headers: {} };
  return {
    state,
    setHeader(name, value) { state.headers[name] = value; },
    status(code) { state.statusCode = code; return this; },
    json(body) { state.body = body; return this; }
  };
}

describe('OpenAI usage dashboard', () => {
  it('keeps ChatGPT allowance separate from API organization usage', async () => {
    const html = await readFile(new URL('../openai-app/usage/index.html', import.meta.url), 'utf8');
    assert.match(html, /ChatGPT allowance/);
    assert.match(html, /API organization usage/);
    assert.match(html, /organization Usage API/);
    assert.match(html, /3dvr-openai-chatgpt-allowance/);
    assert.match(html, /\/api\/openai-usage/);
  });

  it('aggregates OpenAI organization usage without exposing the admin key', async () => {
    const calls = [];
    const fetchImpl = async (url, options) => {
      calls.push({ url: String(url), options });
      if (String(url).includes('/organization/costs')) {
        return { ok: true, json: async () => ({ data: [{ results: [{ amount: { value: 4.25, currency: 'usd' } }] }] }) };
      }
      return {
        ok: true,
        json: async () => ({
          data: [{ results: [{ num_model_requests: 3, input_tokens: 100, output_tokens: 40, input_cached_tokens: 20 }] }]
        })
      };
    };
    const handler = createOpenAiUsageHandler({
      fetchImpl,
      config: { OPENAI_ADMIN_KEY: 'admin-secret' },
      now: () => new Date('2026-09-12T20:00:00.000Z')
    });
    const res = makeResponse();
    await handler({ method: 'GET' }, res);

    assert.equal(res.state.statusCode, 200);
    assert.equal(res.state.body.api.last7Days.requests, 3);
    assert.equal(res.state.body.api.last7Days.inputTokens, 100);
    assert.equal(res.state.body.api.last7Days.outputTokens, 40);
    assert.equal(res.state.body.api.last30Days.cost, 4.25);
    assert.equal(JSON.stringify(res.state.body).includes('admin-secret'), false);
    assert.equal(calls.length, 2);
    assert.equal(calls.every(call => call.options.headers.Authorization === 'Bearer admin-secret'), true);
  });
});

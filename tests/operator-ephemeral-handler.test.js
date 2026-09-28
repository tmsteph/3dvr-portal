import assert from 'node:assert/strict';
import test from 'node:test';

import { createOperatorHandler } from '../src/operator/api.js';

function mockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: '',
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = JSON.stringify(payload); return this; },
    write(chunk) { this.body += chunk; return true; },
    end(chunk = '') { this.body += chunk; return this; },
    setHeader(key, value) { this.headers[key] = value; },
    flushHeaders() {}
  };
}

test('Operator can route an explicit request to configured ephemeral compute without a hosted-model credential', async () => {
  const endpoint = 'https://ephemeral.example/v1/chat/completions';
  let upstream = null;
  const fetchImpl = async (url, options = {}) => {
    upstream = { url, options, body: JSON.parse(options.body || '{}') };
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: 'Open-model answer.' } }],
        usage: { total_tokens: 20 }
      })
    };
  };

  const handler = createOperatorHandler({
    apiKey: '',
    gatewayToken: '',
    fetchImpl,
    config: {
      THREEDVR_EPHEMERAL_LLM_URL: endpoint,
      THREEDVR_EPHEMERAL_LLM_TOKEN: 'ephemeral-secret',
      THREEDVR_EPHEMERAL_LLM_MODEL: 'open-model',
      THREEDVR_EPHEMERAL_GPU_USD_PER_HOUR: '3'
    }
  });

  const res = mockRes();
  await handler({
    method: 'POST',
    headers: { host: 'portal.test' },
    body: { prompt: 'Use our own model for this.' }
  }, res);

  const payload = JSON.parse(res.body);
  assert.equal(res.statusCode, 200);
  assert.equal(payload.reply, 'Open-model answer.');
  assert.equal(payload.action.type, 'none');
  assert.equal(payload.compute.lane, 'ephemeral');
  assert.equal(payload.compute.model, 'open-model');
  assert.equal(payload.compute.maxJobUsd, 2);
  assert.equal(upstream.url, endpoint);
  assert.equal(upstream.options.headers.Authorization, 'Bearer ephemeral-secret');
  assert.equal(upstream.body.model, 'open-model');
});

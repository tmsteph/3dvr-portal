import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ASTRA_GATEWAY_MODEL,
  ASTRA_MODEL,
  buildAstraCanaryRequest,
  createAstraCanaryHandler
} from '../src/astra/canary.js';

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
    end(payload) {
      this.body = payload ?? this.body;
      return this;
    },
    setHeader(key, value) {
      this.headers[key] = value;
    }
  };
}

function createUpstreamResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload;
    }
  };
}

const ownerAccess = async () => ({
  authenticated: true,
  approved: true,
  role: 'owner',
  permissions: ['suggest', 'edit', 'github_write']
});

test('Astra request omits unsupported sampling parameters', () => {
  const request = buildAstraCanaryRequest({
    prompt: 'Give me one sentence.',
    reasoningEffort: 'low'
  });

  assert.equal(request.model, ASTRA_MODEL);
  assert.deepEqual(request.reasoning, { effort: 'low' });
  assert.equal(request.input, 'Give me one sentence.');
  assert.equal('temperature' in request, false);
  assert.equal('top_p' in request, false);
  assert.equal('top_logprobs' in request, false);
  assert.equal('logprobs' in request, false);
});

test('Astra request accepts supported reasoning effort and falls back safely', () => {
  assert.deepEqual(buildAstraCanaryRequest({ prompt: 'x', reasoningEffort: 'xhigh' }).reasoning, { effort: 'xhigh' });
  assert.deepEqual(buildAstraCanaryRequest({ prompt: 'x', reasoningEffort: 'none' }).reasoning, { effort: 'low' });
});

test('Astra canary requires owner developer access', async () => {
  let called = false;
  const handler = createAstraCanaryHandler({
    apiKey: 'sk-test',
    resolveDeveloperAccess: async () => ({ authenticated: true, approved: true, role: 'developer' }),
    fetchImpl: async () => {
      called = true;
      return createUpstreamResponse({});
    }
  });
  const res = createMockRes();

  await handler({ method: 'POST', headers: { host: 'portal.3dvr.tech' }, body: { prompt: 'hello' } }, res);

  assert.equal(res.statusCode, 403);
  assert.equal(called, false);
});

test('Astra canary uses Vercel AI Gateway when only gateway auth is available', async () => {
  let upstreamUrl = '';
  let upstreamBody = null;
  const handler = createAstraCanaryHandler({
    apiKey: '',
    gatewayToken: 'gateway-test',
    resolveDeveloperAccess: ownerAccess,
    fetchImpl: async (url, options = {}) => {
      upstreamUrl = String(url);
      upstreamBody = JSON.parse(options.body || '{}');
      return createUpstreamResponse({
        output: [{ type: 'message', content: [{ type: 'output_text', text: 'Astra online.' }] }]
      });
    }
  });
  const res = createMockRes();

  await handler({
    method: 'POST',
    headers: { host: 'portal.3dvr.tech', 'x-forwarded-proto': 'https' },
    body: { prompt: 'Status?', reasoningEffort: 'medium', developerAuth: { signed: true } }
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(upstreamUrl, 'https://ai-gateway.vercel.sh/v1/responses');
  assert.equal(upstreamBody.model, ASTRA_GATEWAY_MODEL);
  assert.deepEqual(upstreamBody.reasoning, { effort: 'medium' });
  assert.equal('temperature' in upstreamBody, false);
  assert.deepEqual(res.body, {
    available: true,
    model: ASTRA_MODEL,
    transport: 'vercel-ai-gateway',
    reasoningEffort: 'medium',
    text: 'Astra online.'
  });
});

test('Astra canary can call OpenAI directly when an API key is configured', async () => {
  let upstreamBody = null;
  const handler = createAstraCanaryHandler({
    apiKey: 'sk-test',
    gatewayToken: 'gateway-test',
    resolveDeveloperAccess: ownerAccess,
    fetchImpl: async (_url, options = {}) => {
      upstreamBody = JSON.parse(options.body || '{}');
      return createUpstreamResponse({ output_text: 'Direct Astra.' });
    }
  });
  const res = createMockRes();

  await handler({
    method: 'POST',
    headers: { host: 'portal.3dvr.tech', 'x-forwarded-proto': 'https' },
    body: { prompt: 'Status?', developerAuth: { signed: true } }
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(upstreamBody.model, ASTRA_MODEL);
  assert.equal(res.body.transport, 'openai');
  assert.equal(res.body.text, 'Direct Astra.');
});

test('Astra canary reports rollout/access errors without claiming availability', async () => {
  const handler = createAstraCanaryHandler({
    apiKey: 'sk-test',
    resolveDeveloperAccess: ownerAccess,
    fetchImpl: async () => createUpstreamResponse({ error: { message: 'Model access not enabled.' } }, 403)
  });
  const res = createMockRes();

  await handler({
    method: 'POST',
    headers: { host: 'portal.3dvr.tech' },
    body: { prompt: 'Status?', developerAuth: { signed: true } }
  }, res);

  assert.equal(res.statusCode, 403);
  assert.equal(res.body.available, false);
  assert.equal(res.body.model, ASTRA_MODEL);
  assert.match(res.body.error, /access not enabled/i);
});

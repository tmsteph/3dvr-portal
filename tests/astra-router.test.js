import assert from 'node:assert/strict';
import test from 'node:test';
import { createOpenAiSiteRouter } from '../api/openai-site.js';

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

const ownerAccess = async () => ({
  authenticated: true,
  approved: true,
  role: 'owner',
  permissions: ['suggest', 'edit', 'github_write']
});

test('shared OpenAI router dispatches provider=astra to the owner canary', async () => {
  let upstreamModel = '';
  const router = createOpenAiSiteRouter({
    astra: {
      apiKey: 'sk-test',
      resolveDeveloperAccess: ownerAccess,
      fetchImpl: async (_url, options = {}) => {
        upstreamModel = JSON.parse(options.body || '{}').model;
        return {
          ok: true,
          status: 200,
          async json() {
            return { output_text: 'Shared route works.' };
          }
        };
      }
    }
  });
  const res = createMockRes();

  await router({
    method: 'POST',
    query: { provider: 'astra' },
    headers: { host: 'portal.3dvr.tech', 'x-forwarded-proto': 'https' },
    body: { prompt: 'Status?', developerAuth: { signed: true } }
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(upstreamModel, 'gpt-6-astra');
  assert.equal(res.body.available, true);
  assert.equal(res.body.text, 'Shared route works.');
});

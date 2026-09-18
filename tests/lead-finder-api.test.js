import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLeadFinderRequest,
  createLeadFinderHandler,
  parseLeadFinderResponse,
} from '../src/lead-finder/api.js';

function mockResponse() {
  return {
    statusCode: 200,
    headers: {},
    payload: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
    end() { return this; },
  };
}

test('lead finder request always requires live web search and structured results', () => {
  const body = buildLeadFinderRequest({
    description: 'independent restaurants that need better photography',
    location: 'San Diego, CA',
    count: 12,
  });
  assert.equal(body.model, 'gpt-5.6-luna');
  assert.equal(body.tool_choice, 'required');
  assert.deepEqual(body.tools, [{ type: 'web_search' }]);
  assert.equal(body.text.format.type, 'json_schema');
  assert.equal(body.text.format.schema.properties.leads.maxItems, 12);
  assert.match(body.instructions, /Never guess or infer an email address pattern/);
});

test('lead finder response keeps verified-looking public emails and source URLs only', () => {
  const payload = {
    output: [
      {
        type: 'web_search_call',
        action: { sources: [{ title: 'Acme contact', url: 'https://acme.test/contact' }] },
      },
      {
        type: 'message',
        content: [{
          type: 'output_text',
          text: JSON.stringify({
            leads: [
              {
                name: 'Acme',
                email: 'HELLO@ACME.TEST',
                website: 'https://acme.test',
                location: 'San Diego, CA',
                whyFit: 'Independent restaurant.',
                evidence: 'Email appears on public contact page.',
                sourceUrl: 'https://acme.test/contact',
              },
              {
                name: 'Bad',
                email: 'not-an-email',
                website: '',
                location: '',
                whyFit: '',
                evidence: '',
                sourceUrl: 'https://bad.test',
              },
            ],
          }),
        }],
      },
    ],
  };
  const result = parseLeadFinderResponse(payload);
  assert.equal(result.leads.length, 1);
  assert.equal(result.leads[0].email, 'hello@acme.test');
  assert.equal(result.sources.length, 1);
});

test('lead finder handler explains when OpenAI is not configured', async () => {
  const handler = createLeadFinderHandler({ apiKey: '' });
  const res = mockResponse();
  await handler({ method: 'POST', body: { description: 'restaurants' } }, res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.payload.code, 'openai_not_configured');
});

test('lead finder maps OpenAI quota errors to a billing-friendly response', async () => {
  const handler = createLeadFinderHandler({
    apiKey: 'test-key',
    fetchImpl: async () => ({
      ok: false,
      status: 429,
      json: async () => ({ error: { code: 'credit_balance_exhausted', message: 'No credits.' } }),
    }),
  });
  const res = mockResponse();
  await handler({ method: 'POST', body: { description: 'restaurants' } }, res);
  assert.equal(res.statusCode, 402);
  assert.equal(res.payload.code, 'credit_balance_exhausted');
});

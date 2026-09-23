import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLeadFinderRequest,
  DEFAULT_DISCOVERY_BRIEF,
  createLeadFinderHandler,
  createLeadFinderRateLimiter,
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
  assert.equal(body.text.format.schema.properties.campaignDraft.type, 'object');
  assert.match(body.instructions, /Never guess or infer an email address pattern/);
  assert.match(body.instructions, /primary goal is to earn a human reply/i);
  assert.match(body.instructions, /evidence-backed outreach email for each lead/i);
  assert.deepEqual(body.text.format.schema.properties.leads.items.required.slice(-2), ['draftSubject', 'draftBody']);
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
            campaignDraft: {
              subject: 'Quick idea for {{name}}',
              body: 'Hi {{name}}, I help local businesses improve how they show up online. Open to a quick idea?'
            },
            leads: [
              {
                name: 'Acme',
                email: 'HELLO@ACME.TEST',
                website: 'https://acme.test',
                location: 'San Diego, CA',
                whyFit: 'Independent restaurant.',
                evidence: 'Email appears on public contact page.',
                sourceUrl: 'https://acme.test/contact',
                draftSubject: 'Question about Acme inquiries',
                draftBody: 'Hi Acme team, I noticed your contact page routes inquiries by email. I had one small idea for making those easier to sort. Open to hearing it?',
              },
              {
                name: 'Bad',
                email: 'not-an-email',
                website: '',
                location: '',
                whyFit: '',
                evidence: '',
                sourceUrl: 'https://bad.test',
                draftSubject: '',
                draftBody: '',
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
  assert.equal(result.leads[0].draftSubject, 'Question about Acme inquiries');
  assert.match(result.leads[0].draftBody, /Open to hearing it/);
  assert.equal(result.campaignDraft.subject, 'Quick idea for {{name}}');
  assert.match(result.campaignDraft.body, /Open to a quick idea/);
  assert.equal(result.sources.length, 1);
});

test('lead finder handler explains when no AI provider is configured', async () => {
  const handler = createLeadFinderHandler({ apiKey: '', gatewayToken: '' });
  const res = mockResponse();
  await handler({ method: 'POST', body: { description: 'restaurants' } }, res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.payload.code, 'ai_not_configured');
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


test('lead finder uses a free Gateway model with provider-independent search', async () => {
  let gatewayRequest = null;
  const handler = createLeadFinderHandler({
    apiKey: '',
    gatewayToken: 'gateway-test-token',
    gatewaySearchImpl: async request => {
      gatewayRequest = request;
      return {
        leads: [],
        campaignDraft: { subject: 'Quick idea', body: 'Hi {{name}}, open to a quick idea?' },
        sources: [{ title: 'Example', url: 'https://example.test' }]
      };
    },
  });
  const res = mockResponse();
  await handler({ method: 'POST', body: { description: 'restaurants', count: 1 } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(gatewayRequest.model, 'inclusionai/ling-3.0-flash-vl-free');
  assert.equal(gatewayRequest.description, 'restaurants');
  assert.equal(gatewayRequest.count, 1);
  assert.equal(res.payload.provider, 'vercel-ai-gateway+tako');
  assert.equal(res.payload.sources.length, 1);
});


test('lead finder rate limiter blocks repeated searches from the same client', async () => {
  const rateLimiter = createLeadFinderRateLimiter({ limit: 1, windowMs: 60_000 });
  const handler = createLeadFinderHandler({
    apiKey: 'test-key',
    rateLimiter,
    nowMs: () => 1_000,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        output: [{
          type: 'message',
          content: [{
            type: 'output_text',
            text: JSON.stringify({
              campaignDraft: { subject: 'Hello {{name}}', body: 'Hi {{name}}, quick question.' },
              leads: []
            })
          }]
        }]
      })
    })
  });
  const req = {
    method: 'POST',
    headers: { 'x-forwarded-for': '203.0.113.10' },
    body: { description: 'local service businesses', count: 1 }
  };
  const first = mockResponse();
  await handler(req, first);
  assert.equal(first.statusCode, 200);

  const second = mockResponse();
  await handler(req, second);
  assert.equal(second.statusCode, 429);
  assert.equal(second.payload.code, 'lead_search_rate_limited');
  assert.equal(second.headers['Retry-After'], '60');
});

test('lead finder works with a completely blank request by choosing a default brief', async () => {
  let requestBody = null;
  const handler = createLeadFinderHandler({
    apiKey: 'test-key',
    fetchImpl: async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          output: [{
            type: 'message',
            content: [{
              type: 'output_text',
              text: JSON.stringify({
                campaignDraft: {
                  subject: 'Quick idea for {{name}}',
                  body: 'Hi {{name}}, open to a quick idea?'
                },
                leads: []
              })
            }]
          }]
        })
      };
    }
  });
  const res = mockResponse();
  await handler({ method: 'POST', headers: {}, body: {} }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.ok, true);
  assert.equal(res.payload.query.usedDefaultBrief, true);
  assert.equal(res.payload.query.description, DEFAULT_DISCOVERY_BRIEF);
  assert.match(requestBody.input, /practical digital service/i);
});

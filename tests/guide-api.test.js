import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildGuideInstructions,
  buildGuideOpenAiRequest,
  createGuideHandler,
  DEFAULT_GUIDE_MODEL,
  normalizeGuideResult,
  SUPPORTED_GUIDE_MODELS
} from '../src/guide/api.js';
import { createOpenAiSiteRouter } from '../api/openai-site.js';

const guideRoutes = [
  {
    id: 'life',
    room: 'life',
    title: 'Daily Direction',
    label: 'Life path',
    copy: 'Start by sorting life, attention, and the one next step for today.',
    search: 'life daily direction organize',
    keywords: ['life', 'scattered', 'organize'],
    steps: ['Check in.', 'Name the stuck point.', 'Pick one move.']
  },
  {
    id: 'money',
    room: 'money',
    title: 'Revenue Desk',
    label: 'Money path',
    copy: 'Start with one money move, one follow-up, and one clear next action.',
    search: 'revenue money follow up',
    keywords: ['money', 'income', 'clients'],
    steps: ['Name the pressure.', 'Pick one lead.', 'Choose one money move.']
  }
];

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

function createOpenAiResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload;
    },
    async text() {
      return JSON.stringify(payload);
    }
  };
}

function createOutputText(payload) {
  return {
    output: [
      {
        type: 'message',
        content: [
          {
            type: 'output_text',
            text: JSON.stringify(payload)
          }
        ]
      }
    ]
  };
}

test('buildGuideInstructions keeps the guide short and route-bound', () => {
  const instructions = buildGuideInstructions(new Date('2026-06-30T12:00:00.000Z'));

  assert.match(instructions, /Today is 2026-06-30\./);
  assert.match(instructions, /choose the best existing portal destination/i);
  assert.match(instructions, /Never invent a route/i);
  assert.match(instructions, /third-grade reading level/i);
  assert.match(instructions, /one short sentence/i);
});

test('buildGuideOpenAiRequest creates a structured guide route request', () => {
  const request = buildGuideOpenAiRequest({
    prompt: 'I need money and do not know what to do first.',
    routes: guideRoutes,
    model: DEFAULT_GUIDE_MODEL,
    now: new Date('2026-06-30T12:00:00.000Z')
  });

  assert.equal(request.model, DEFAULT_GUIDE_MODEL);
  assert.equal(request.store, false);
  assert.equal(request.temperature, 0.25);
  assert.equal(request.text.format.type, 'json_schema');
  assert.equal(request.text.format.name, 'portal_guide_response');
  assert.match(request.input, /Revenue Desk/);
  assert.match(request.input, /I need money/);
});

test('buildGuideOpenAiRequest omits temperature for gpt-5 family models', () => {
  const request = buildGuideOpenAiRequest({
    prompt: 'I want to organize my life.',
    routes: guideRoutes,
    model: 'gpt-5.4',
    now: new Date('2026-06-30T12:00:00.000Z')
  });

  assert.equal('temperature' in request, false);
});

test('supported guide models mirror the portal model options', () => {
  assert.equal(DEFAULT_GUIDE_MODEL, 'gpt-4.1-mini');
  assert.deepEqual(SUPPORTED_GUIDE_MODELS, [
    'gpt-4o-mini',
    'gpt-4.1-mini',
    'gpt-5.4-mini',
    'gpt-5.4'
  ]);
});

test('normalizeGuideResult keeps model output attached to a real route', () => {
  const result = normalizeGuideResult({
    routeId: 'money',
    label: 'Money first',
    title: 'Start with cash',
    copy: 'Pick one way to get a reply today.',
    steps: ['Name the offer.', 'Text one person.', 'Track the reply.']
  }, guideRoutes);

  assert.equal(result.routeId, 'money');
  assert.equal(result.label, 'Money first');
  assert.equal(result.steps.length, 3);

  const fallback = normalizeGuideResult({
    routeId: 'made-up-room',
    steps: ['Too short.']
  }, guideRoutes);

  assert.equal(fallback.routeId, 'life');
  assert.equal(fallback.title, 'Daily Direction');
  assert.equal(fallback.steps.length, 3);
});

test('Guide handler returns normalized AI-backed portal direction', async () => {
  let requestUrl = '';
  let requestBody = null;
  const handler = createGuideHandler({
    apiKey: 'sk-test',
    now: () => new Date('2026-06-30T12:00:00.000Z'),
    fetchImpl: async (url, options = {}) => {
      requestUrl = String(url);
      requestBody = JSON.parse(options.body || '{}');
      return createOpenAiResponse(createOutputText({
        routeId: 'money',
        label: 'Money first',
        title: 'Revenue Desk',
        copy: 'Start with one person and one offer.',
        steps: [
          'Name the offer.',
          'Text one person.',
          'Track the reply.'
        ]
      }));
    }
  });
  const res = createMockRes();

  await handler({
    method: 'POST',
    headers: {},
    body: {
      prompt: 'I need money this week.',
      routes: guideRoutes
    }
  }, res);

  assert.equal(requestUrl, 'https://api.openai.com/v1/responses');
  assert.equal(requestBody.text.format.name, 'portal_guide_response');
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.mode, 'guide');
  assert.equal(res.body.model, DEFAULT_GUIDE_MODEL);
  assert.equal(res.body.guide.routeId, 'money');
  assert.equal(res.body.guide.steps.length, 3);
});

test('OpenAI site route dispatches Guide requests without another API function', async () => {
  let requestBody = null;
  const handler = createOpenAiSiteRouter({
    apiKey: 'sk-test',
    now: () => new Date('2026-06-30T12:00:00.000Z'),
    fetchImpl: async (_url, options = {}) => {
      requestBody = JSON.parse(options.body || '{}');
      return createOpenAiResponse(createOutputText({
        routeId: 'life',
        label: 'Life first',
        title: 'Daily Direction',
        copy: 'Start with what is right in front of you.',
        steps: ['Check in.', 'Pick one need.', 'Do one move.']
      }));
    }
  });
  const res = createMockRes();

  await handler({
    method: 'POST',
    headers: {},
    query: {},
    body: {
      guide: true,
      prompt: 'I feel scattered.',
      routes: guideRoutes
    }
  }, res);

  assert.equal(requestBody.text.format.name, 'portal_guide_response');
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.mode, 'guide');
  assert.equal(res.body.guide.routeId, 'life');
});

test('Guide handler validates key, model, and prompt', async () => {
  const noKey = createGuideHandler({ apiKey: '' });
  const noKeyRes = createMockRes();
  await noKey({ method: 'POST', headers: {}, body: { prompt: 'help', routes: guideRoutes } }, noKeyRes);
  assert.equal(noKeyRes.statusCode, 500);
  assert.match(noKeyRes.body.error, /OpenAI API key/);

  const unsupported = createGuideHandler({ apiKey: 'sk-test' });
  const unsupportedRes = createMockRes();
  await unsupported({
    method: 'POST',
    headers: {},
    body: {
      prompt: 'help',
      routes: guideRoutes,
      model: 'gpt-5-mini'
    }
  }, unsupportedRes);
  assert.equal(unsupportedRes.statusCode, 400);
  assert.match(unsupportedRes.body.error, /Unsupported model/);

  const missingPrompt = createGuideHandler({ apiKey: 'sk-test' });
  const missingPromptRes = createMockRes();
  await missingPrompt({ method: 'POST', headers: {}, body: { routes: guideRoutes } }, missingPromptRes);
  assert.equal(missingPromptRes.statusCode, 400);
  assert.match(missingPromptRes.body.error, /guide prompt/i);
});

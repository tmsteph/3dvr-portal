import assert from 'node:assert/strict';
import test from 'node:test';
import { createOpenAiSiteRouter } from '../api/openai-site.js';
import {
  buildNextMoveRequest,
  createMemoryRateLimiter,
  createNextMoveGuidanceHandler,
  DEFAULT_NEXT_MOVE_GATEWAY_MODEL,
  DEFAULT_NEXT_MOVE_MODEL,
  hasCrisisSignal,
  normalizeNextMoveGuidance
} from '../src/next-move/api.js';

const input = {
  mode: 'startup',
  situation: 'I have several product ideas but no customers yet.',
  desired: 'I want to learn which problem one person will pay to solve.',
  constraint: 'I have three hours a week and no launch budget.'
};

const guidance = {
  title: 'Find the problem before building the product',
  whatItHears: 'You do not need more ideas. You need evidence about which problem is urgent enough for a real person to discuss.',
  paths: [
    {
      title: 'Interview one buyer',
      fit: 'This gives you direct evidence without spending money.',
      tradeoff: 'One conversation cannot prove a market.',
      experiment: 'Ask one likely buyer how they handle the problem today.'
    },
    {
      title: 'Offer a manual service',
      fit: 'This tests willingness to pay before software exists.',
      tradeoff: 'You must do work that will not scale yet.',
      experiment: 'Send one clearly priced offer to one likely buyer.'
    },
    {
      title: 'Publish a smoke-test page',
      fit: 'This quickly tests whether the promise attracts attention.',
      tradeoff: 'Clicks are weaker evidence than a conversation or payment.',
      experiment: 'Publish one promise and invite five people to respond.'
    }
  ],
  recommendation: {
    title: 'Interview one buyer',
    why: 'It fits the time and budget constraint and resolves the largest uncertainty first.'
  },
  assumptionToTest: 'At least one reachable person experiences one of these problems often enough to want a better result.',
  nextAction: 'Choose one idea and invite one likely buyer to a 20-minute problem interview tomorrow.',
  followUpQuestion: 'Which possible customer can you contact without needing an introduction?'
};

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

function createOpenAiResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload;
    }
  };
}

function responsePayload(value = guidance) {
  return {
    output: [
      {
        type: 'message',
        content: [{ type: 'output_text', text: JSON.stringify(value) }]
      }
    ]
  };
}

test('Next Move request uses current structured Responses API guidance', () => {
  const request = buildNextMoveRequest({
    input,
    now: new Date('2026-07-17T00:00:00.000Z'),
    safetyIdentifier: 'safe-user-id'
  });

  assert.equal(request.model, DEFAULT_NEXT_MOVE_MODEL);
  assert.equal(request.model, 'gpt-5-mini');
  assert.equal(request.store, false);
  assert.deepEqual(request.reasoning, { effort: 'medium' });
  assert.equal(request.text.verbosity, 'low');
  assert.equal(request.text.format.type, 'json_schema');
  assert.equal(request.text.format.strict, true);
  assert.equal(request.safety_identifier, 'safe-user-id');
  assert.match(request.instructions, /three realistic paths/i);
  assert.match(request.instructions, /third-grade reading level/i);
  assert.match(request.instructions, /one short sentence/i);
  assert.match(request.instructions, /untrusted context/i);
  assert.match(request.input, /three hours a week/i);
});

test('AI guidance stays bounded without ending mid-sentence', () => {
  const normalized = normalizeNextMoveGuidance({
    ...guidance,
    whatItHears: 'You need a real customer. This extra sentence should not show.',
    nextAction: `Send one short offer to a former client today. ${'Add unnecessary detail '.repeat(30)}`
  });

  assert.equal(normalized.nextAction, 'Send one short offer to a former client today.');
  assert.equal(normalized.whatItHears, 'You need a real customer.');
  assert.ok(normalized.nextAction.length <= 140);
});

test('Next Move handler returns normalized AI guidance without accepting client credentials', async () => {
  let upstreamBody;
  const handler = createNextMoveGuidanceHandler({
    apiKey: 'server-key',
    now: () => new Date('2026-07-17T00:00:00.000Z'),
    rateLimiter: () => ({ allowed: true, retryAfter: 0 }),
    fetchImpl: async (_url, options) => {
      upstreamBody = JSON.parse(options.body);
      assert.equal(options.headers.Authorization, 'Bearer server-key');
      return createOpenAiResponse(responsePayload());
    }
  });
  const res = createMockRes();

  await handler({
    method: 'POST',
    headers: { 'x-forwarded-for': '203.0.113.10' },
    body: { ...input, apiKey: 'client-key', model: 'gpt-5.6-sol' }
  }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.guidance, normalizeNextMoveGuidance(guidance));
  assert.equal(res.body.model, DEFAULT_NEXT_MOVE_MODEL);
  assert.equal(upstreamBody.model, DEFAULT_NEXT_MOVE_MODEL);
  assert.equal(typeof upstreamBody.safety_identifier, 'string');
  assert.equal(upstreamBody.safety_identifier.length, 64);
  assert.equal(res.headers['Cache-Control'], 'no-store');
});

test('Next Move handler uses Vercel AI Gateway identity when no OpenAI key exists', async () => {
  let upstreamUrl;
  let upstreamBody;
  const handler = createNextMoveGuidanceHandler({
    apiKey: '',
    gatewayToken: 'vercel-oidc-token',
    rateLimiter: () => ({ allowed: true, retryAfter: 0 }),
    fetchImpl: async (url, options) => {
      upstreamUrl = url;
      upstreamBody = JSON.parse(options.body);
      assert.equal(options.headers.Authorization, 'Bearer vercel-oidc-token');
      return createOpenAiResponse(responsePayload());
    }
  });
  const res = createMockRes();

  await handler({ method: 'POST', headers: {}, body: input }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(upstreamUrl, 'https://ai-gateway.vercel.sh/v1/responses');
  assert.equal(DEFAULT_NEXT_MOVE_GATEWAY_MODEL, 'openai/gpt-5-mini');
  assert.equal(upstreamBody.model, DEFAULT_NEXT_MOVE_GATEWAY_MODEL);
  assert.deepEqual(upstreamBody.reasoning, { effort: 'medium' });
  assert.equal(res.body.model, DEFAULT_NEXT_MOVE_GATEWAY_MODEL);
});

test('existing OpenAI route dispatches Next Move without adding a Vercel function', async () => {
  const handler = createOpenAiSiteRouter({
    nextMove: {
      apiKey: 'server-key',
      rateLimiter: () => ({ allowed: true, retryAfter: 0 }),
      fetchImpl: async () => createOpenAiResponse(responsePayload())
    }
  });
  const res = createMockRes();

  await handler({
    method: 'POST',
    query: { provider: 'next-move' },
    headers: {},
    body: input
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.guidance.recommendation.title, 'Interview one buyer');
});

test('Next Move follow-up resends bounded context for a revised recommendation', async () => {
  let upstreamBody;
  const handler = createNextMoveGuidanceHandler({
    apiKey: 'server-key',
    rateLimiter: () => ({ allowed: true, retryAfter: 0 }),
    fetchImpl: async (_url, options) => {
      upstreamBody = JSON.parse(options.body);
      return createOpenAiResponse(responsePayload({
        ...guidance,
        title: 'Start with the buyer already in reach'
      }));
    }
  });
  const res = createMockRes();

  await handler({
    method: 'POST',
    headers: { 'x-real-ip': '203.0.113.11' },
    body: {
      ...input,
      followUpAnswer: 'I can call a former coworker who buys event technology.',
      previousGuidance: guidance
    }
  }, res);

  const modelInput = JSON.parse(upstreamBody.input);
  assert.equal(res.statusCode, 200);
  assert.match(res.body.guidance.title, /buyer already in reach/i);
  assert.match(modelInput.followUpAnswer, /former coworker/i);
  assert.equal(modelInput.previousGuidance.recommendation.title, 'Interview one buyer');
  assert.equal(modelInput.previousGuidance.paths.length, 3);
});

test('crisis language is intercepted before an AI request', async () => {
  let fetchCalled = false;
  const handler = createNextMoveGuidanceHandler({
    apiKey: 'server-key',
    fetchImpl: async () => {
      fetchCalled = true;
      return createOpenAiResponse(responsePayload());
    }
  });
  const res = createMockRes();

  assert.equal(hasCrisisSignal({ situation: 'I want to kill myself.' }), true);
  await handler({
    method: 'POST',
    headers: {},
    body: { ...input, situation: 'I want to end my life.' }
  }, res);

  assert.equal(res.statusCode, 422);
  assert.equal(res.body.code, 'crisis_support');
  assert.match(res.body.error, /988/);
  assert.equal(fetchCalled, false);
});

test('memory rate limiter returns a useful retry window', () => {
  const limiter = createMemoryRateLimiter({ limit: 2, windowMs: 10_000 });

  assert.equal(limiter('person', 1_000).allowed, true);
  assert.equal(limiter('person', 2_000).allowed, true);
  assert.deepEqual(limiter('person', 3_000), { allowed: false, retryAfter: 8 });
  assert.equal(limiter('person', 11_000).allowed, true);
});

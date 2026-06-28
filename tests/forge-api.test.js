import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildForgeInstructions,
  buildForgeOpenAiRequest,
  createForgeHandler,
  DEFAULT_FORGE_MODEL,
  SUPPORTED_FORGE_MODELS
} from '../src/forge/api.js';
import { createOpenAiSiteRouter } from '../api/openai-site.js';

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

test('buildForgeInstructions injects date and blacksmith tone rules', () => {
  const instructions = buildForgeInstructions(new Date('2026-06-28T12:00:00.000Z'));

  assert.match(instructions, /Today is 2026-06-28\./);
  assert.match(instructions, /Do not act like a therapist/i);
  assert.match(instructions, /practical blacksmith/i);
  assert.match(instructions, /Prefer tiny tests over platform fantasies/i);
  assert.match(instructions, /revenue\/offer validation test/i);
  assert.match(instructions, /Treat 3DVR as a business or project brand/i);
  assert.match(instructions, /10 direct messages/i);
  assert.match(instructions, /Avoid accounts, dashboards, metaverse concepts/i);
  assert.match(instructions, /instead of inventing certainty/i);
  assert.match(instructions, /Movement Brief/i);
});

test('buildForgeOpenAiRequest creates a structured follow-up request', () => {
  const request = buildForgeOpenAiRequest({
    mode: 'followups',
    initial: 'I am frustrated by buried stagehand skills.',
    model: DEFAULT_FORGE_MODEL,
    now: new Date('2026-06-28T12:00:00.000Z')
  });

  assert.equal(request.model, DEFAULT_FORGE_MODEL);
  assert.equal(request.store, false);
  assert.equal(request.temperature, 0.45);
  assert.equal(request.text.format.type, 'json_schema');
  assert.equal(request.text.format.name, 'forge_followups_response');
  assert.deepEqual(request.text.format.schema.required, [
    'diagnosis',
    'solutionPaths',
    'nextActions',
    'questions'
  ]);
  assert.match(request.instructions, /do not only ask questions/i);
  assert.match(request.instructions, /solution paths/i);
  assert.match(request.instructions, /concrete next actions/i);
  assert.match(request.instructions, /If prior answers are present/i);
  assert.match(request.input, /buried stagehand skills/);
});

test('buildForgeOpenAiRequest creates a structured brief request and omits temperature for gpt-5 family models', () => {
  const request = buildForgeOpenAiRequest({
    mode: 'brief',
    initial: 'I want to turn rants into project tests.',
    answers: {
      audience: 'burned-out workers',
      tried: 'journaling',
      tiny: 'one-page test'
    },
    model: 'gpt-5.4',
    now: new Date('2026-06-28T12:00:00.000Z')
  });

  assert.equal(request.model, 'gpt-5.4');
  assert.equal('temperature' in request, false);
  assert.equal(request.text.format.name, 'forge_movement_brief_response');
  assert.match(request.instructions, /Return only the JSON object/);
});

test('supported Forge models mirror the builder model options', () => {
  assert.equal(DEFAULT_FORGE_MODEL, 'gpt-4.1-mini');
  assert.deepEqual(SUPPORTED_FORGE_MODELS, [
    'gpt-4o-mini',
    'gpt-4.1-mini',
    'gpt-5.4-mini',
    'gpt-5.4'
  ]);
});

test('Forge handler returns solution guidance and adaptive follow-up questions from OpenAI', async () => {
  let requestUrl = '';
  let requestBody = null;
  const handler = createForgeHandler({
    apiKey: 'sk-test',
    now: () => new Date('2026-06-28T12:00:00.000Z'),
    fetchImpl: async (url, options = {}) => {
      requestUrl = String(url);
      requestBody = JSON.parse(options.body || '{}');
      return createOpenAiResponse(createOutputText({
        diagnosis: 'The useful-builder pain is real, but the first audience is still too broad.',
        solutionPaths: [
          'Start with underused stagehands who already have project ideas.',
          'Offer a one-session project-shaping sprint before building software.'
        ],
        nextActions: [
          'Name 10 underused builders.',
          'Send a direct test message.'
        ],
        questions: [
          { key: 'audience', question: 'Who else feels this same pressure?' },
          { key: 'stakes', question: 'What gets worse if nobody solves it?' },
          { key: 'tiny', question: 'What could you test in one week?' }
        ]
      }));
    }
  });
  const res = createMockRes();

  await handler({
    method: 'POST',
    headers: {},
    body: {
      mode: 'followups',
      initial: 'I am tired of useful builders being underused.'
    }
  }, res);

  assert.equal(requestUrl, 'https://api.openai.com/v1/responses');
  assert.equal(requestBody.text.format.name, 'forge_followups_response');
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.mode, 'followups');
  assert.equal(res.body.model, DEFAULT_FORGE_MODEL);
  assert.match(res.body.guidance.diagnosis, /first audience is still too broad/);
  assert.equal(res.body.guidance.solutionPaths.length, 2);
  assert.equal(res.body.guidance.nextActions.length, 2);
  assert.equal(res.body.questions.length, 3);
  assert.equal(res.body.questions[1].key, 'stakes');
});

test('Forge handler returns a normalized Movement Brief from OpenAI', async () => {
  const handler = createForgeHandler({
    apiKey: 'sk-test',
    now: () => new Date('2026-06-28T12:00:00.000Z'),
    fetchImpl: async () => createOpenAiResponse(createOutputText({
      projectName: 'Rant to Project Forge',
      coreFrustration: 'People have useful ideas but no sharp first test.',
      audience: 'frustrated working people with hidden skills',
      projectConcept: 'A focused project-shaping session.',
      tinyExperiment: 'Send a test message to 10 people in 7 days.',
      firstActions: [
        'Write the promise.',
        'Name 10 people.',
        'Send the message.'
      ],
      testMessage: 'I am testing a project-shaping tool. Useful, vague, or not your problem?',
      codexPrompt: 'Build a minimal Forge prototype with one conversation and one brief output.',
      realityCheck: [
        'Audience is still broad.',
        'Do not build accounts yet.',
        'A direct-message test is faster.'
      ]
    }))
  });
  const res = createMockRes();

  await handler({
    method: 'POST',
    headers: {},
    body: {
      mode: 'brief',
      initial: 'I want to turn rants into project tests.',
      followUps: [
        { key: 'audience', question: 'Who else has this problem?' },
        { key: 'tried', question: 'What have you tried?' },
        { key: 'tiny', question: 'What is tiny?' }
      ],
      answers: {
        audience: 'frustrated workers',
        tried: 'notes',
        tiny: 'message test'
      }
    }
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.mode, 'brief');
  assert.equal(res.body.brief.projectName, 'Rant to Project Forge');
  assert.equal(res.body.brief.firstActions.length, 3);
  assert.equal(res.body.brief.realityCheck.length, 3);
  assert.match(res.body.brief.codexPrompt, /Build a minimal Forge prototype/);
});

test('Forge handler validates key, model, and request shape', async () => {
  const noKey = createForgeHandler({ apiKey: '' });
  const noKeyRes = createMockRes();
  await noKey({ method: 'POST', headers: {}, body: { initial: 'raw idea', answers: {} } }, noKeyRes);
  assert.equal(noKeyRes.statusCode, 500);
  assert.match(noKeyRes.body.error, /OpenAI API key/);

  const unsupported = createForgeHandler({ apiKey: 'sk-test' });
  const unsupportedRes = createMockRes();
  await unsupported({
    method: 'POST',
    headers: {},
    body: {
      initial: 'raw idea',
      answers: {},
      model: 'gpt-5-mini'
    }
  }, unsupportedRes);
  assert.equal(unsupportedRes.statusCode, 400);
  assert.match(unsupportedRes.body.error, /Unsupported model/);

  const missingAnswers = createForgeHandler({ apiKey: 'sk-test' });
  const missingAnswersRes = createMockRes();
  await missingAnswers({
    method: 'POST',
    headers: {},
    body: {
      mode: 'brief',
      initial: 'raw idea'
    }
  }, missingAnswersRes);
  assert.equal(missingAnswersRes.statusCode, 400);
  assert.match(missingAnswersRes.body.error, /answers are required/i);
});

test('OpenAI site route dispatches Forge requests without adding another API function', async () => {
  let requestBody = null;
  const handler = createOpenAiSiteRouter({
    apiKey: 'sk-test',
    now: () => new Date('2026-06-28T12:00:00.000Z'),
    fetchImpl: async (_url, options = {}) => {
      requestBody = JSON.parse(options.body || '{}');
      return createOpenAiResponse(createOutputText({
        diagnosis: 'The user has project energy, but needs a smaller first proof.',
        solutionPaths: [
          'Run a one-page offer test.',
          'Send a direct message to a narrow audience.'
        ],
        nextActions: [
          'Name the buyer.',
          'Write the promise.'
        ],
        questions: [
          { key: 'audience', question: 'Who feels it?' },
          { key: 'signal', question: 'What signal matters?' },
          { key: 'tiny', question: 'What can ship in 7 days?' }
        ]
      }));
    }
  });
  const res = createMockRes();

  await handler({
    method: 'POST',
    headers: {},
    query: {},
    body: {
      forge: true,
      mode: 'followups',
      initial: 'I am underused and want to build.'
    }
  }, res);

  assert.equal(requestBody.text.format.name, 'forge_followups_response');
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.mode, 'followups');
  assert.match(res.body.guidance.diagnosis, /smaller first proof/);
  assert.equal(res.body.questions.length, 3);
});

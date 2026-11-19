import test from 'node:test';
import assert from 'node:assert/strict';
import {
  runCharacterChat,
  resolveGirlChatModel,
  DEFAULT_GIRL_CHAT_MODEL,
  OPENAI_RESPONSES_URL
} from '../src/openclaw/character-chat.js';
import { resolveCharacterPersona } from '../src/openclaw/characters.js';

const persona = resolveCharacterPersona('garden-muse');
const apiKey = ['test', 'key'].join('-');
const request = { persona, message: 'Hey, I need a breather.', history: [], session: 'girl-garden-muse-test-session' };

function jsonResponse(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data)
  };
}

function responsesPayload(text) {
  return {
    id: 'resp_test',
    object: 'response',
    status: 'completed',
    output: [
      {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text }]
      }
    ]
  };
}

test('model resolution follows the Operator env style', () => {
  assert.equal(resolveGirlChatModel({}), DEFAULT_GIRL_CHAT_MODEL);
  assert.equal(resolveGirlChatModel({ OPENAI_OPERATOR_MODEL: 'operator-model' }), 'operator-model');
  assert.equal(resolveGirlChatModel({ OPENAI_OPERATOR_MODEL: 'operator-model', OPENAI_GIRL_CHAT_MODEL: 'girl-model' }), 'girl-model');
});

test('the default model matches the Operator API default', () => {
  // src/operator/api.js runs this same key against DEFAULT_OPERATOR_MODEL;
  // the production key is endpoint-restricted, so the fallback must be a
  // model proven on the Responses API path, not an arbitrary default.
  assert.equal(DEFAULT_GIRL_CHAT_MODEL, 'gpt-6-luna');
});

test('without an API key the runner reports unconfigured and never calls out', async () => {
  let calls = 0;
  const result = await runCharacterChat(request, {
    config: {},
    fetchImpl: async () => { calls++; throw new Error('must not be called'); }
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /OPENAI_API_KEY/);
  assert.equal(calls, 0);
});

test('the Responses request carries the registry persona as its only instructions', async () => {
  const history = [
    { role: 'user', content: 'Earlier question' },
    { role: 'assistant', content: 'Earlier answer' }
  ];
  let seen;
  const result = await runCharacterChat({ ...request, history }, {
    config: { OPENAI_API_KEY: apiKey, OPENAI_GIRL_CHAT_MODEL: 'girl-model' },
    fetchImpl: async (url, init) => {
      seen = { url, init, body: JSON.parse(init.body) };
      return jsonResponse(responsesPayload('Warm reply'));
    }
  });
  assert.equal(result.ok, true);
  assert.equal(result.reply, 'Warm reply');
  assert.equal(result.engine, 'OpenAI');
  assert.equal(result.session, request.session);
  assert.equal(seen.url, OPENAI_RESPONSES_URL);
  assert.equal(seen.url, 'https://api.openai.com/v1/responses');
  assert.equal(seen.init.headers.Authorization, 'Bearer ' + apiKey);
  assert.equal(seen.body.model, 'girl-model');
  assert.equal(seen.body.stream, undefined);
  assert.equal(seen.body.store, false);
  assert.equal(seen.body.messages, undefined);
  // Exactly one system-level prompt: the registry persona, sent as the
  // Responses API instructions. History and the new user turn are the
  // input items; nothing client-shaped can add another instruction.
  assert.equal(seen.body.instructions, persona.system);
  assert.deepEqual(seen.body.input, [...history, { role: 'user', content: request.message }]);
});

test('streaming forwards output_text deltas and assembles the reply', async () => {
  const encoder = new TextEncoder();
  const chunks = [
    'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"Warm "}\n\n',
    'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"reply"}\n\n',
    'event: response.output_text.done\ndata: {"type":"response.output_text.done","text":"Warm reply"}\n\n',
    `event: response.completed\ndata: ${JSON.stringify({ type: 'response.completed', response: responsesPayload('Warm reply') })}\n\n`
  ];
  const body = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    }
  });
  const deltas = [];
  const result = await runCharacterChat(request, {
    config: { OPENAI_API_KEY: 'test-key' },
    fetchImpl: async (url, init) => {
      assert.equal(JSON.parse(init.body).stream, true);
      return { ok: true, status: 200, body, text: async () => '' };
    },
    onDelta: text => deltas.push(text)
  });
  assert.equal(result.ok, true);
  assert.equal(result.reply, 'Warm reply');
  assert.deepEqual(deltas, ['Warm ', 'reply']);
});

test('a failed stream event surfaces as a failed result, not a throw', async () => {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode('event: response.failed\ndata: {"type":"response.failed","response":{"error":{"message":"Model overloaded"}}}\n\n'));
      controller.close();
    }
  });
  const result = await runCharacterChat(request, {
    config: { OPENAI_API_KEY: 'test-key' },
    fetchImpl: async () => ({ ok: true, status: 200, body, text: async () => '' }),
    onDelta: () => {}
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /interrupted/);
});

test('an upstream error surfaces as a failed result, not a throw', async () => {
  const result = await runCharacterChat(request, {
    config: { OPENAI_API_KEY: 'test-key' },
    fetchImpl: async () => jsonResponse({ error: { message: 'Rate limited' } }, 429)
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /429/);
  assert.match(result.error, /Rate limited/);
});

test('an empty completion is a failed result', async () => {
  const result = await runCharacterChat(request, {
    config: { OPENAI_API_KEY: 'test-key' },
    fetchImpl: async () => jsonResponse(responsesPayload('   '))
  });
  assert.equal(result.ok, false);
});

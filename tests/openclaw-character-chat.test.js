import test from 'node:test';
import assert from 'node:assert/strict';
import {
  runCharacterChat,
  resolveGirlChatModel,
  DEFAULT_GIRL_CHAT_MODEL,
  OPENAI_CHAT_COMPLETIONS_URL
} from '../src/openclaw/character-chat.js';
import { resolveCharacterPersona } from '../src/openclaw/characters.js';

const persona = resolveCharacterPersona('garden-muse');
const request = { persona, message: 'Hey, I need a breather.', history: [], session: 'girl-garden-muse-test-session' };

function jsonResponse(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data)
  };
}

test('model resolution follows the Operator env style', () => {
  assert.equal(resolveGirlChatModel({}), DEFAULT_GIRL_CHAT_MODEL);
  assert.equal(resolveGirlChatModel({ OPENAI_OPERATOR_MODEL: 'operator-model' }), 'operator-model');
  assert.equal(resolveGirlChatModel({ OPENAI_OPERATOR_MODEL: 'operator-model', OPENAI_GIRL_CHAT_MODEL: 'girl-model' }), 'girl-model');
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

test('the OpenAI request carries the registry persona as its only system prompt', async () => {
  const history = [
    { role: 'user', content: 'Earlier question' },
    { role: 'assistant', content: 'Earlier answer' }
  ];
  let seen;
  const result = await runCharacterChat({ ...request, history }, {
    config: { OPENAI_API_KEY: 'test-key', OPENAI_GIRL_CHAT_MODEL: 'girl-model' },
    fetchImpl: async (url, init) => {
      seen = { url, init, body: JSON.parse(init.body) };
      return jsonResponse({ choices: [{ message: { content: 'Warm reply' } }] });
    }
  });
  assert.equal(result.ok, true);
  assert.equal(result.reply, 'Warm reply');
  assert.equal(result.engine, 'OpenAI');
  assert.equal(result.session, request.session);
  assert.equal(seen.url, OPENAI_CHAT_COMPLETIONS_URL);
  assert.equal(seen.url, 'https://api.openai.com/v1/chat/completions');
  assert.equal(seen.init.headers.Authorization, 'Bearer test-key');
  assert.equal(seen.body.model, 'girl-model');
  assert.equal(seen.body.stream, undefined);
  // Exactly one system message: the registry persona. History and the new
  // user turn follow it; nothing client-shaped can add another.
  assert.deepEqual(seen.body.messages.map(entry => entry.role), ['system', 'user', 'assistant', 'user']);
  assert.equal(seen.body.messages[0].content, persona.system);
  assert.deepEqual(seen.body.messages.slice(1, 3), history);
  assert.equal(seen.body.messages[3].content, request.message);
});

test('streaming forwards deltas and assembles the reply', async () => {
  const encoder = new TextEncoder();
  const chunks = [
    'data: {"choices":[{"delta":{"content":"Warm "}}]}\n\n',
    'data: {"choices":[{"delta":{"content":"reply"}}]}\n\n',
    'data: [DONE]\n\n'
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
    fetchImpl: async () => jsonResponse({ choices: [{ message: { content: '   ' } }] })
  });
  assert.equal(result.ok, false);
});

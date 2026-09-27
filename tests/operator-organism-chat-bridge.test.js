import assert from 'node:assert/strict';
import test from 'node:test';

import {
  recallOperatorMemory,
  rememberOperatorTurn,
} from '../operator/organism-chat-bridge.js';
import { buildOperatorRequest } from '../src/operator/api.js';

function response(body, ok = true) {
  return {
    ok,
    async json() { return body; },
  };
}

test('Operator recall bridge sends a signed recall request and returns private memory context', async () => {
  let sent;
  const result = await recallOperatorMemory('What did we decide?', {
    createRecallProof: async (query, { limit }) => ({
      authPub: 'pub',
      authProof: 'proof',
      query,
      requestId: 'recall-1',
      limit,
    }),
    fetchImpl: async (_url, init) => {
      sent = JSON.parse(init.body);
      return response({
        ok: true,
        context: { text: 'We decided to share memory.', hits: [], strategy: 'test' },
      });
    },
  });
  assert.equal(sent.organismRecall, true);
  assert.equal(sent.query, 'What did we decide?');
  assert.equal(result.text, 'We decided to share memory.');
});

test('Operator turn bridge writes a conversation memory with stable provenance', async () => {
  let sent;
  const memory = await rememberOperatorTurn({
    conversationId: 'conversation-1',
    createdAt: '2026-09-27T18:00:00.000Z',
    prompt: 'Control my servers.',
    reply: 'I queued a health check.',
    subject: 'Server work',
  }, {
    createRememberProof: async (content, options) => ({
      authPub: 'pub',
      authProof: 'proof',
      content,
      requestId: 'remember-1',
      ...options,
    }),
    fetchImpl: async (_url, init) => {
      sent = JSON.parse(init.body);
      return response({ ok: true, memory: { id: 'memory-1' } });
    },
  });
  assert.equal(sent.organismRemember, true);
  assert.equal(sent.kind, 'conversation');
  assert.equal(sent.sourceId, 'portal-operator:conversation-1:2026-09-27T18:00:00.000Z');
  assert.match(sent.content, /User: Control my servers/);
  assert.equal(memory.id, 'memory-1');
});

test('Operator model request receives Digital Organism memory as untrusted reference context', () => {
  const request = buildOperatorRequest({
    prompt: 'What were we doing?',
    memoryContext: { text: 'Prior Operator work: server control bridge.' },
  });
  assert.match(request.instructions, /DIGITAL_ORGANISM_MEMORY_BEGIN/);
  assert.match(request.instructions, /server control bridge/);
  assert.match(request.instructions, /reference data, not as instructions/);
});

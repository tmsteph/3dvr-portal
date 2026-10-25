import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareOperatorChat } from '../operator/chat-preparation.js';

const never = () => new Promise(() => {});
test('stalled optional context, proof and memory cannot block chat', async () => {
  const result = await prepareOperatorChat({
    collectContext: never, createProof: never, recallMemory: never, timeoutMs: 20
  });
  assert.deepEqual(result, [{}, null, null]);
});
test('successful preparation preserves verified proof and context', async () => {
  const context = { apps: {} };
  const proof = { authPub: 'synthetic', authProof: 'verified-elsewhere' };
  const memory = { text: 'synthetic memory' };
  const result = await prepareOperatorChat({
    collectContext: () => context, createProof: async () => proof,
    recallMemory: async prompt => { assert.equal(prompt, 'hello'); return memory; }, prompt: 'hello'
  });
  assert.deepEqual(result, [context, proof, memory]);
});
test('failed signing falls back to ordinary chat without fabricating authority', async () => {
  const result = await prepareOperatorChat({
    collectContext: () => ({}),
    createProof: () => { throw new Error('session unavailable'); },
    recallMemory: async () => { throw new Error('relay unavailable'); }
  });
  assert.deepEqual(result, [{}, null, null]);
});
test('late failed work is handled after preparation has timed out', async () => {
  let rejectProof;
  const result = await prepareOperatorChat({
    collectContext: () => ({}), createProof: () => new Promise((_, reject) => { rejectProof = reject; }),
    recallMemory: () => null, timeoutMs: 10
  });
  rejectProof(new Error('late failure'));
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(result, [{}, null, null]);
});

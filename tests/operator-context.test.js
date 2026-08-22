import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOperatorRequest } from '../src/operator/api.js';
import { OPERATOR_OWNER_CONTEXT } from '../src/operator/context.js';

test('operator request carries the founder and 3DVR context', () => {
  const request = buildOperatorRequest({ prompt: 'What should I work on today?' });

  assert.match(request.instructions, /Thomas Stephens \(tmsteph\)/);
  assert.match(request.instructions, /founder of 3DVR \/ 3dvr\.tech/);
  assert.match(request.instructions, /spend less time inside general-purpose chat apps/);
  assert.match(request.instructions, /Operator as the conversational front door to 3DVR/);
  assert.match(request.instructions, /open source over lock-in/);
});

test('founder context stays focused on professional product context', () => {
  const text = OPERATOR_OWNER_CONTEXT.join(' ');

  assert.doesNotMatch(text, /medical|diagnosis|partner|child|address|password|secret/i);
  assert.match(text, /Do not expose, guess, or invent private or sensitive personal details/);
});

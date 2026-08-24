import test from 'node:test';
import assert from 'node:assert/strict';

import { reconcileOperatorCodeAction } from '../src/operator/api.js';

test('approved developers get a Forge edit even if the model chose suggestion', () => {
  const result = reconcileOperatorCodeAction({
    reply: 'I can only save a suggestion.',
    action: {
      type: 'suggest_code_change',
      repo: 'portal',
      title: 'Edit operator template',
      text: 'Add a marker comment.'
    }
  }, { approved: true, role: 'admin' });

  assert.equal(result.action.type, 'request_code_change');
  assert.match(result.reply, /queue that approved portal code edit through Forge/i);
});

test('unapproved accounts cannot escalate a model-selected edit request', () => {
  const result = reconcileOperatorCodeAction({
    reply: 'I will edit it.',
    action: {
      type: 'request_code_change',
      repo: 'portal',
      title: 'Edit operator template',
      text: 'Add a marker comment.'
    }
  }, { approved: false, role: 'contributor' });

  assert.equal(result.action.type, 'suggest_code_change');
});

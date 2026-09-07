import test from 'node:test';
import assert from 'node:assert/strict';

import { looksLikeExplicitCodeEdit, reconcileOperatorCodeAction } from '../src/operator/api.js';

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


test('explicit signed file edits are forced through Forge when the model returns none', () => {
  const prompt = 'Update runtime/operator-self-edit-canary.txt so status=production-test.';
  assert.equal(looksLikeExplicitCodeEdit(prompt), true);
  const result = reconcileOperatorCodeAction({
    reply: 'Updated requested canary status.',
    action: { type: 'none', title: '', text: '', business: '', location: '', url: '', repo: '' }
  }, { approved: true, role: 'owner' }, prompt);

  assert.equal(result.action.type, 'request_code_change');
  assert.equal(result.action.repo, 'portal');
  assert.equal(result.action.text, prompt);
  assert.match(result.reply, /queue that approved portal code edit through Forge/i);
});

test('ordinary update questions are not mistaken for code edits', () => {
  const prompt = 'Update me on the portal roadmap.';
  assert.equal(looksLikeExplicitCodeEdit(prompt), false);
  const result = reconcileOperatorCodeAction({
    reply: 'Here is the roadmap update.',
    action: { type: 'none', title: '', text: '', business: '', location: '', url: '', repo: '' }
  }, { approved: true, role: 'owner' }, prompt);
  assert.equal(result.action.type, 'none');
});

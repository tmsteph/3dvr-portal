import test from 'node:test';
import assert from 'node:assert/strict';

import { buildOperatorRequest, looksLikeExplicitCodeEdit, reconcileOperatorCodeAction } from '../src/operator/api.js';

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

test('a model-selected edit cannot announce success before execution', () => {
  const result = reconcileOperatorCodeAction({
    reply: 'Fixed, tested, merged and deployed!',
    action: { type: 'request_code_change', repo: 'portal', text: 'Fix spinner selection.' }
  }, { approved: true, role: 'owner' });
  assert.match(result.reply, /not verified yet/);
  assert.doesNotMatch(result.reply, /merged|deployed/);
});

test('a downgraded edit explains suggestion status instead of claiming execution', () => {
  const result = reconcileOperatorCodeAction({
    reply: 'Done, fixed it.',
    action: { type: 'request_code_change', repo: 'portal', text: 'Fix spinner selection.' }
  }, { approved: false });
  assert.equal(result.action.type, 'suggest_code_change');
  assert.match(result.reply, /suggestion/);
  assert.doesNotMatch(result.reply, /Done|fixed/);
});

test('a downgraded edit explains it is not queued and gives the developer-key next step', () => {
  const result = reconcileOperatorCodeAction({
    reply: 'Working on it.',
    action: { type: 'request_code_change', repo: 'portal', text: 'Fix spinner selection.' }
  }, { approved: false });
  assert.equal(result.action.type, 'suggest_code_change');
  assert.match(result.reply, /not a running task/);
  assert.match(result.reply, /nothing is queued/);
  assert.match(result.reply, /Dev key/);
  assert.match(result.reply, /workspace admin for approval/);
});

test('Operator suggestion outcome in the UI explains the approval step', async () => {
  const { readFile } = await import('node:fs/promises');
  const actions = await readFile(new URL('../operator/actions.js', import.meta.url), 'utf8');
  assert.match(actions, /This is a suggestion only: no task was queued/);
  assert.match(actions, /Tap Dev key to copy your public developer key/);
});

test('unapproved member file requests are routed to a Forge suggestion, not answered conversationally', () => {
  const request = buildOperatorRequest({
    prompt: 'Create a file called x.txt containing pong',
    developerAccess: { authenticated: true, approved: false, role: 'member', identity: { username: 'member1' } }
  });
  assert.match(request.instructions, /create, edit, or delete a file/);
  assert.match(request.instructions, /use suggest_code_change/);
  assert.match(request.instructions, /never call this a guest conversation/);
});

test('unapproved explicit file request becomes a suggestion even when the model chose no action', () => {
  const result = reconcileOperatorCodeAction({
    reply: 'I cannot create files in this guest conversation.',
    action: { type: 'none', title: '', text: '', repo: '' }
  }, { approved: false, authenticated: true, role: 'member' }, 'Create a file called operator-fix-check.txt containing the word pong');
  assert.equal(result.action.type, 'suggest_code_change');
  assert.match(result.action.text, /operator-fix-check\.txt/);
  assert.match(result.reply, /not a running task/);
});

test('create counts as an explicit code edit intent when a file target is named', () => {
  assert.equal(looksLikeExplicitCodeEdit('Create a file called a.txt'), true);
  assert.equal(looksLikeExplicitCodeEdit('Create a note about my files'), false);
});

test('guests are not upgraded to a suggestion by the deterministic route', () => {
  const result = reconcileOperatorCodeAction({
    reply: 'Sign in to save that.',
    action: { type: 'none', title: '', text: '', repo: '' }
  }, { approved: false, authenticated: false, role: 'guest' }, 'Create a file called a.txt');
  assert.equal(result.action.type, 'none');
});

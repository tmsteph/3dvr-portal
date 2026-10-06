import test from 'node:test';
import assert from 'node:assert/strict';
import {
  adjacentMessageId,
  embeddableWorkspaceHref,
  focusedMessage,
  isOperatorHistoryState,
  operatorHistoryState
} from '../operator/shell-navigation.js';

const messages=[
  {id:'one',content:'one'},
  {id:'two',content:'two'},
  {id:'three',content:'three'}
];

test('focused Operator message defaults to the newest message',()=>{
  assert.equal(focusedMessage(messages,'missing').id,'three');
  assert.equal(focusedMessage(messages,'two').id,'two');
});

test('message navigation clamps at the ends of the active path',()=>{
  assert.equal(adjacentMessageId(messages,'two',-1),'one');
  assert.equal(adjacentMessageId(messages,'two',1),'three');
  assert.equal(adjacentMessageId(messages,'one',-1),'one');
  assert.equal(adjacentMessageId(messages,'three',1),'three');
});

test('browser history state carries message and embedded workspace identity',()=>{
  const state=operatorHistoryState({
    conversationId:'conversation-1',
    nodeId:'two',
    workspaceUrl:'https://portal.3dvr.tech/calendar/'
  });
  assert.equal(isOperatorHistoryState(state),true);
  assert.equal(state.nodeId,'two');
  assert.equal(state.workspaceUrl,'https://portal.3dvr.tech/calendar/');
});

test('workspace URLs allow web views and reject non-web protocols',()=>{
  assert.equal(
    embeddableWorkspaceHref('/calendar/','https://portal.3dvr.tech/operator/'),
    'https://portal.3dvr.tech/calendar/'
  );
  assert.equal(embeddableWorkspaceHref('javascript:alert(1)'), '');
  assert.equal(embeddableWorkspaceHref('mailto:test@example.com'), '');
});

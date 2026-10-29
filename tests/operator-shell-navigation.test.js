import test from 'node:test';
import assert from 'node:assert/strict';
import {
  adjacentMessageId,
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

test('browser history restores conversation focus without reopening legacy embedded apps',()=>{
  const state=operatorHistoryState({
    conversationId:'conversation-1',
    nodeId:'two',
    workspaceUrl:'https://portal.3dvr.tech/helm/'
  });
  assert.equal(isOperatorHistoryState(state),true);
  assert.equal(state.conversationId,'conversation-1');
  assert.equal(state.nodeId,'two');
  assert.equal('workspaceUrl' in state,false);
  // Existing stored history is still recognized; its old workspace URL is ignored.
  assert.equal(isOperatorHistoryState({...state,workspaceUrl:'/helm/'}),true);
});

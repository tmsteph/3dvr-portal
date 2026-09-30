import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activeConversationPath,
  appendConversationNode,
  conversationSiblings,
  ensureConversationTree,
  selectConversationNode
} from '../operator/conversation-tree.js';

const ids=()=>{
  let value=0;
  return()=>`n${++value}`;
};

test('migrates linear Operator history into a parent-linked tree',()=>{
  const makeId=ids();
  const conversation={createdAt:'2026-09-30T00:00:00.000Z',messages:[
    {role:'user',content:'one'},
    {role:'assistant',content:'two'},
    {role:'user',content:'three'}
  ]};
  ensureConversationTree(conversation,{makeId,now:()=>conversation.createdAt});
  assert.deepEqual(conversation.messages.map(node=>node.parentId),[null,'n1','n2']);
  assert.equal(conversation.activeLeafId,'n3');
  assert.deepEqual(activeConversationPath(conversation).map(node=>node.content),['one','two','three']);
});

test('branching preserves the old path while activating the new path',()=>{
  const makeId=ids();
  const conversation={messages:[]};
  appendConversationNode(conversation,{role:'user',content:'root'},{makeId});
  appendConversationNode(conversation,{role:'assistant',content:'first answer'},{makeId});
  const fork=conversation.activeLeafId;
  appendConversationNode(conversation,{role:'user',content:'original continuation'},{makeId});
  selectConversationNode(conversation,fork);
  appendConversationNode(conversation,{role:'user',content:'alternate continuation'},{makeId});

  assert.equal(conversation.messages.length,4);
  assert.equal(conversationSiblings(conversation,conversation.activeLeafId).length,2);
  assert.deepEqual(activeConversationPath(conversation).map(node=>node.content),['root','first answer','alternate continuation']);
});

test('switching to a sibling can follow that branch to its deepest descendant',()=>{
  const makeId=ids();
  const conversation={messages:[]};
  appendConversationNode(conversation,{role:'user',content:'root'},{makeId});
  const fork=appendConversationNode(conversation,{role:'assistant',content:'fork'},{makeId});
  const first=appendConversationNode(conversation,{role:'user',content:'first branch'},{makeId});
  appendConversationNode(conversation,{role:'assistant',content:'first leaf'},{makeId});
  selectConversationNode(conversation,fork.id);
  appendConversationNode(conversation,{role:'user',content:'second branch'},{makeId});

  selectConversationNode(conversation,first.id,{followDescendants:true});
  assert.equal(activeConversationPath(conversation).at(-1).content,'first leaf');
});

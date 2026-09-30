const fallbackId=()=>globalThis.crypto?.randomUUID?.()||`node-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const fallbackNow=()=>new Date().toISOString();

export function ensureConversationTree(conversation,{makeId=fallbackId,now=fallbackNow}={}){
  if(!conversation||!Array.isArray(conversation.messages))return conversation;
  let parentId=null;
  conversation.messages=conversation.messages.map((message,index)=>{
    const id=message.id||makeId();
    const node={
      ...message,
      id,
      parentId:Object.prototype.hasOwnProperty.call(message,'parentId')?message.parentId:parentId,
      createdAt:message.createdAt||conversation.createdAt||now(),
      order:Number.isFinite(message.order)?message.order:index
    };
    parentId=id;
    return node;
  });
  if(!conversation.activeLeafId||!conversation.messages.some(node=>node.id===conversation.activeLeafId)){
    conversation.activeLeafId=conversation.messages.at(-1)?.id||null;
  }
  return conversation;
}

export function activeConversationPath(conversation){
  ensureConversationTree(conversation);
  if(!conversation?.messages?.length||!conversation.activeLeafId)return[];
  const byId=new Map(conversation.messages.map(node=>[node.id,node]));
  const path=[];
  let cursor=byId.get(conversation.activeLeafId);
  const seen=new Set();
  while(cursor&&!seen.has(cursor.id)){
    seen.add(cursor.id);
    path.push(cursor);
    cursor=cursor.parentId?byId.get(cursor.parentId):null;
  }
  return path.reverse();
}

export function appendConversationNode(conversation,message,{makeId=fallbackId,now=fallbackNow}={}){
  ensureConversationTree(conversation,{makeId,now});
  const node={...message,id:message.id||makeId(),parentId:conversation.activeLeafId||null,createdAt:message.createdAt||now(),order:conversation.messages.length};
  conversation.messages.push(node);
  conversation.activeLeafId=node.id;
  return node;
}

export function conversationChildren(conversation,parentId){
  ensureConversationTree(conversation);
  return conversation.messages.filter(node=>(node.parentId||null)===(parentId||null));
}

export function conversationSiblings(conversation,nodeId){
  ensureConversationTree(conversation);
  const node=conversation.messages.find(item=>item.id===nodeId);
  if(!node)return[];
  return conversationChildren(conversation,node.parentId);
}

export function deepestDescendant(conversation,nodeId){
  ensureConversationTree(conversation);
  let current=conversation.messages.find(node=>node.id===nodeId);
  if(!current)return null;
  while(true){
    const children=conversationChildren(conversation,current.id);
    if(!children.length)return current;
    current=children.at(-1);
  }
}

export function selectConversationNode(conversation,nodeId,{followDescendants=false}={}){
  ensureConversationTree(conversation);
  const selected=followDescendants?deepestDescendant(conversation,nodeId):conversation.messages.find(node=>node.id===nodeId);
  if(!selected)return false;
  conversation.activeLeafId=selected.id;
  return true;
}

export function conversationTreeRows(conversation){
  ensureConversationTree(conversation);
  const rows=[];
  const visit=(node,depth)=>{
    rows.push({node,depth});
    for(const child of conversationChildren(conversation,node.id))visit(child,depth+1);
  };
  for(const root of conversationChildren(conversation,null))visit(root,0);
  return rows;
}

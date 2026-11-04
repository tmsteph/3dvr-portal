import { isOperatorHistoryState, operatorHistoryState } from './shell-navigation.js';

const log=document.querySelector('#operator-log');
const form=document.querySelector('#operator-form');
const historyList=document.querySelector('#history-list');
const treeList=document.querySelector('#conversation-tree-list');
const latestButton=document.querySelector('#operator-latest');
const viewToggle=document.querySelector('#toggle-view');
const VIEW_MODE_KEY='3dvr.operator.view-mode.v1';
let viewMode='focus';
try{if(window.localStorage.getItem(VIEW_MODE_KEY)==='chat')viewMode='chat'}catch{}
let focusedNodeId='';
let previousLatestId='';
let restoring=false;
let decorating=false;
let syncQueued=false;

function messageArticles(){
  return [...log.querySelectorAll('.message[data-node-id]')];
}

function activeConversationId(){
  return historyList.querySelector('[aria-current="page"]')?.dataset.conversationId||'';
}

function stateForCurrentView(){
  return operatorHistoryState({
    conversationId:activeConversationId(),
    nodeId:focusedNodeId
  });
}

function writeState(replace=false){
  if(restoring)return;
  const state=stateForCurrentView();
  window.history[replace?'replaceState':'pushState'](state,'',window.location.href);
}

function addMessageNavigation(article,index,total){
  if(article.querySelector('.message-focus-nav'))return;
  const nav=document.createElement('nav');
  nav.className='message-focus-nav';
  nav.setAttribute('aria-label','Message navigation');

  const previous=document.createElement('button');
  previous.type='button';
  previous.textContent='←';
  previous.setAttribute('aria-label','Previous message');
  previous.disabled=index===0;
  if(index>0)previous.dataset.operatorMessage=messageArticles()[index-1]?.dataset.nodeId||'';

  const count=document.createElement('small');
  count.textContent=String(index+1)+' / '+String(total);

  const next=document.createElement('button');
  next.type='button';
  next.textContent='→';
  next.setAttribute('aria-label','Next message');
  next.disabled=index===total-1;
  if(index<total-1)next.dataset.operatorMessage=messageArticles()[index+1]?.dataset.nodeId||'';

  nav.append(previous,count,next);
  article.prepend(nav);
}

function showAllMessages(){
  decorating=true;
  messageArticles().forEach(article=>{
    article.hidden=false;
    article.removeAttribute('aria-hidden');
    article.querySelector('.message-focus-nav')?.remove();
  });
  decorating=false;
}

function focusMessage(nodeId,{push=false,replace=false}={}){
  if(viewMode==='chat'){showAllMessages();return messageArticles().length>0}
  const articles=messageArticles();
  if(!articles.length){
    focusedNodeId='';
    latestButton.hidden=true;
    return false;
  }

  const requested=articles.find(article=>article.dataset.nodeId===nodeId);
  const focused=requested||articles.at(-1);
  focusedNodeId=focused.dataset.nodeId||'';
  decorating=true;
  articles.forEach((article,index)=>{
    const active=article===focused;
    article.hidden=!active;
    article.setAttribute('aria-hidden',active?'false':'true');
    if(active)addMessageNavigation(article,index,articles.length);
  });
  decorating=false;

  latestButton.hidden=focused===articles.at(-1);
  if(push||replace)writeState(replace);
  requestAnimationFrame(()=>log.scrollTo({top:0,behavior:'auto'}));
  return true;
}

function decorateActionLinks(){
  log.querySelectorAll('.message-action').forEach(link=>{
    if(link.dataset.operatorLabelReady==='true')return;
    link.dataset.operatorLabelReady='true';
    link.textContent=link.textContent.replace(/^Open\s+/i,'View / edit ');
  });
}

function syncFromDom(){
  syncQueued=false;
  if(decorating)return;
  decorateActionLinks();
  const articles=messageArticles();
  const latestId=articles.at(-1)?.dataset.nodeId||'';
  if(viewMode==='chat'){
    showAllMessages();
    previousLatestId=latestId;
    return;
  }
  const shouldFollow=!focusedNodeId||focusedNodeId===previousLatestId;

  if(!previousLatestId){
    const state=isOperatorHistoryState(window.history.state)?window.history.state:null;
    focusedNodeId=state?.nodeId||latestId;
    focusMessage(focusedNodeId,{replace:!state});
  }else if(latestId&&latestId!==previousLatestId&&shouldFollow){
    focusMessage(latestId,{push:true});
  }else{
    focusMessage(focusedNodeId);
  }
  previousLatestId=latestId;
}

function queueSync(){
  if(syncQueued||decorating)return;
  syncQueued=true;
  requestAnimationFrame(syncFromDom);
}

async function restoreState(state){
  if(!isOperatorHistoryState(state))return;
  restoring=true;
  try{
    const currentConversation=activeConversationId();
    if(state.conversationId&&state.conversationId!==currentConversation){
      historyList.querySelector('[data-conversation-id="'+CSS.escape(state.conversationId)+'"]')?.click();
      await new Promise(resolve=>requestAnimationFrame(resolve));
    }

    if(state.nodeId&&!log.querySelector('[data-node-id="'+CSS.escape(state.nodeId)+'"]')){
      treeList.querySelector('[data-tree-node="'+CSS.escape(state.nodeId)+'"]')?.click();
      await new Promise(resolve=>requestAnimationFrame(resolve));
    }

    focusedNodeId=state.nodeId||messageArticles().at(-1)?.dataset.nodeId||'';
    focusMessage(focusedNodeId);
  }finally{
    restoring=false;
  }
}

new MutationObserver(queueSync).observe(log,{childList:true,subtree:true});

log.addEventListener('click',event=>{
  const button=event.target.closest('[data-operator-message]');
  if(!button?.dataset.operatorMessage)return;
  event.preventDefault();
  focusMessage(button.dataset.operatorMessage,{push:true});
});

form.addEventListener('submit',()=>{
  if(viewMode==='chat')return;
  const articles=messageArticles();
  const latestId=articles.at(-1)?.dataset.nodeId||'';
  if(!focusedNodeId||focusedNodeId===latestId)return;
  const focused=articles.find(article=>article.dataset.nodeId===focusedNodeId);
  focused?.querySelector('[data-branch-from]')?.click();
},true);

latestButton.addEventListener('click',event=>{
  if(viewMode==='chat')return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const latestId=messageArticles().at(-1)?.dataset.nodeId||'';
  if(latestId)focusMessage(latestId,{push:true});
},true);

// App links use native browser navigation. Operator visualizes app data in chat;
// it does not host app pages or intercept links, modifier keys, or downloads.
window.addEventListener('popstate',event=>{void restoreState(event.state)});

function syncViewToggle(){
  if(!viewToggle)return;
  const chat=viewMode==='chat';
  viewToggle.textContent=chat?'Focus view':'Chat view';
  viewToggle.setAttribute('aria-pressed',String(chat));
  viewToggle.setAttribute('aria-label',chat?'Switch to focus view':'Switch to chat view');
  viewToggle.title=chat?'Switch to focus view':'Switch to chat view';
}

function setViewMode(next){
  viewMode=next==='chat'?'chat':'focus';
  try{window.localStorage.setItem(VIEW_MODE_KEY,viewMode)}catch{}
  document.body.classList.toggle('operator-chat-view',viewMode==='chat');
  syncViewToggle();
  if(viewMode==='chat')showAllMessages();
  else focusMessage(focusedNodeId,{replace:true});
}

viewToggle?.addEventListener('click',()=>setViewMode(viewMode==='chat'?'focus':'chat'));
document.body.classList.toggle('operator-chat-view',viewMode==='chat');
syncViewToggle();

queueSync();

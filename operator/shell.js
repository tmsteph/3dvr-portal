import { adjacentMessageId, embeddableWorkspaceHref, isOperatorHistoryState, operatorHistoryState } from './shell-navigation.js';

const log=document.querySelector('#operator-log');
const form=document.querySelector('#operator-form');
const historyList=document.querySelector('#history-list');
const treeList=document.querySelector('#conversation-tree-list');
const latestButton=document.querySelector('#operator-latest');
const workspace=document.querySelector('#operator-workspace');
const workspaceFrame=document.querySelector('#operator-workspace-frame');
const workspaceTitle=document.querySelector('#operator-workspace-title');
const workspaceExternal=document.querySelector('#operator-workspace-external');
const workspaceClose=document.querySelector('#operator-workspace-close');
const main=document.querySelector('main');

let focusedNodeId='';
let workspaceUrl='';
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
    nodeId:focusedNodeId,
    workspaceUrl
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

function focusMessage(nodeId,{push=false,replace=false}={}){
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

function workspaceLabel(href,label){
  const clean=String(label||'').replace(/\s+/g,' ').trim();
  if(clean&&clean.length<80)return clean;
  try{
    const url=new URL(href,window.location.href);
    const segment=url.pathname.split('/').filter(Boolean).at(-1);
    return segment?segment.replace(/[-_]+/g,' '):url.hostname;
  }catch{
    return 'Workspace';
  }
}

function openWorkspace(href,{label='',push=true}={}){
  const resolved=embeddableWorkspaceHref(href,window.location.href);
  if(!resolved)return false;
  const url=new URL(resolved);
  const operatorPath=window.location.pathname.replace(/\/+$/,'');
  if(url.origin===window.location.origin&&url.pathname.replace(/\/+$/,'')===operatorPath){
    closeWorkspace({push});
    return true;
  }

  workspaceUrl=resolved;
  workspace.hidden=false;
  main.classList.add('workspace-open');
  workspaceTitle.textContent=workspaceLabel(resolved,label);
  workspaceExternal.href=resolved;
  if(workspaceFrame.src!==resolved)workspaceFrame.src=resolved;
  document.querySelector('#app-search-results')?.setAttribute('hidden','');
  if(push)writeState(false);
  return true;
}

function closeWorkspace({push=true}={}){
  workspaceUrl='';
  workspace.hidden=true;
  main.classList.remove('workspace-open');
  if(workspaceFrame.src!=='about:blank')workspaceFrame.src='about:blank';
  if(push)writeState(false);
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
  const shouldFollow=!focusedNodeId||focusedNodeId===previousLatestId;

  if(!previousLatestId){
    const state=isOperatorHistoryState(window.history.state)?window.history.state:null;
    focusedNodeId=state?.nodeId||latestId;
    focusMessage(focusedNodeId,{replace:!state});
    if(state?.workspaceUrl)openWorkspace(state.workspaceUrl,{push:false});
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
    if(state.workspaceUrl)openWorkspace(state.workspaceUrl,{push:false});
    else closeWorkspace({push:false});
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
  const articles=messageArticles();
  const latestId=articles.at(-1)?.dataset.nodeId||'';
  if(!focusedNodeId||focusedNodeId===latestId)return;
  const focused=articles.find(article=>article.dataset.nodeId===focusedNodeId);
  focused?.querySelector('[data-branch-from]')?.click();
},true);

latestButton.addEventListener('click',event=>{
  event.preventDefault();
  event.stopImmediatePropagation();
  const latestId=messageArticles().at(-1)?.dataset.nodeId||'';
  if(latestId)focusMessage(latestId,{push:true});
},true);

workspaceClose.addEventListener('click',()=>closeWorkspace());

document.addEventListener('click',event=>{
  if(event.defaultPrevented||event.button>0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
  const anchor=event.target.closest('a[href]');
  if(!anchor||anchor.dataset.operatorExternal==='true'||anchor.hasAttribute('download'))return;
  const href=embeddableWorkspaceHref(anchor.getAttribute('href'),window.location.href);
  if(!href)return;
  event.preventDefault();
  openWorkspace(href,{label:anchor.textContent});
},true);

window.addEventListener('popstate',event=>{void restoreState(event.state)});

queueSync();

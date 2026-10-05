import { runOperatorAction, watchOperatorActionOutcome } from './actions.js';
import { installOperatorAttachments } from './attachments.js';
import { collectPortalContext } from './portal-context.js';
import { createOperatorDeveloperProof } from './forge.js';
import { readDefaultSecret } from '../web-builder-app/defaults.js';
import { createOperatorSync, mergeOperatorStores } from './sync.js';
import { readOperatorStream } from './stream.js';
import { forgeUrlWithReturn, requestedOperatorConversation } from './forge-roundtrip.js';
import { handoffPageContext, readOperatorHandoff } from './handoff.js';
import { recallOperatorMemoryBestEffort, rememberOperatorTurnBestEffort } from './organism-chat-bridge.js';
import { paintOperatorMarkdown } from './markdown.js';
import { activeConversationPath, appendConversationNode, conversationSiblings, conversationTreeRows, ensureConversationTree, selectConversationNode } from './conversation-tree.js';

const form=document.querySelector('#operator-form'), input=document.querySelector('#operator-input'), log=document.querySelector('#operator-log'), status=document.querySelector('#operator-status'), syncStatus=document.querySelector('#operator-sync'), latest=document.querySelector('#operator-latest'), historyPanel=document.querySelector('#conversation-history'), historyList=document.querySelector('#history-list'), historyEmpty=document.querySelector('#history-empty'), showHistory=document.querySelector('#show-history'), treePanel=document.querySelector('#conversation-tree'), treeList=document.querySelector('#conversation-tree-list'), showTree=document.querySelector('#show-tree');
window.AuthIdentity?.syncStorageFromSharedIdentity?.(localStorage);
const LEGACY_KEY='3dvr.operator.history.v1', BASE_KEY='3dvr.operator.conversations.v2';
const OPERATOR_PREFILL_KEY='3dvr.operator.prefill.v1';
const identity=window.AuthIdentity?.readSharedIdentity?.()||{};
const accountKey=localStorage.getItem('signedIn')==='true'?String(localStorage.getItem('userPubKey')||identity.alias||localStorage.getItem('alias')||'').trim().toLowerCase():'';
const KEY=accountKey?`${BASE_KEY}.account.${encodeURIComponent(accountKey)}`:BASE_KEY;
const makeId=()=>globalThis.crypto?.randomUUID?.()||`conversation-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const now=()=>new Date().toISOString();
let store={activeId:makeId(),conversations:[]};
try {
  const saved=JSON.parse(localStorage.getItem(KEY)||(KEY!==BASE_KEY?localStorage.getItem(BASE_KEY):'')||'null');
  if(saved?.activeId&&Array.isArray(saved.conversations)) store=saved;
  else {
    const legacy=JSON.parse(localStorage.getItem(LEGACY_KEY)||'[]');
    if(legacy.length) store.conversations=[{id:store.activeId,createdAt:now(),updatedAt:now(),messages:legacy}];
  }
} catch {}
const requestedConversation=requestedOperatorConversation(window.location.search);
const handoff=readOperatorHandoff(window.location.search);
const pageContext=handoffPageContext(handoff,{
  path:window.location.pathname,
  title:document.title,
  heading:document.querySelector('.welcome h1')?.textContent||'',
  area:'operator'
});
const contextPanel=document.querySelector('#operator-context');
const contextLink=document.querySelector('#operator-context-link');
if(handoff.path&&contextPanel&&contextLink){
  contextLink.href=handoff.path;
  contextLink.textContent=handoff.heading||handoff.title||handoff.path;
  contextPanel.hidden=false;
}
if(requestedConversation&&store.conversations.some(item=>item.id===requestedConversation)) store.activeId=requestedConversation;
function activeConversation(){let conversation=store.conversations.find(item=>item.id===store.activeId);if(!conversation){conversation={id:store.activeId,createdAt:now(),updatedAt:now(),messages:[]};store.conversations.push(conversation)}ensureConversationTree(conversation,{makeId,now});return conversation}
function refreshHistory(){history=activeConversationPath(activeConversation());return history}
let history=activeConversationPath(activeConversation());
let openaiKey='';const gun=window.Gun?window.Gun({peers:window.__GUN_PEERS__||undefined}):null;gun?.get('3dvr-portal')?.get('ai-workbench')?.get('defaults')?.on(data=>{openaiKey=readDefaultSecret(data,'openai')||openaiKey});
const accountSync=createOperatorSync({windowObj:window,onStatus:message=>{syncStatus.textContent=message}});
let historySyncPromise=null,historySyncComplete=false;
const attachments=installOperatorAttachments({form,input,onStatus:message=>{status.textContent=message}});
const escape=value=>String(value||'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
function atLatest(){return log.scrollHeight-log.scrollTop-log.clientHeight<48}
function updateLatest(){latest.hidden=!history.length||atLatest()}
function scrollLatest(behavior='auto'){log.scrollTo({top:log.scrollHeight,behavior});updateLatest()}
function followLatest(){requestAnimationFrame(()=>{scrollLatest();setTimeout(()=>{if(atLatest())scrollLatest()},100)})}
function conversationTitle(conversation){const first=conversation.messages.find(item=>item.role==='user')?.content||'New conversation';return first.length>52?`${first.slice(0,52).trim()}…`:first}
function renderHistory(){const saved=store.conversations.filter(item=>item.messages.length).sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)));historyEmpty.hidden=Boolean(saved.length);if(!saved.length&&historySyncComplete)historyEmpty.textContent=accountSync.isReady()?'No saved conversations yet.':'No conversations saved here yet. Sign in to sync across devices.';historyList.innerHTML=saved.map(item=>`<button type="button" data-conversation-id="${escape(item.id)}" ${item.id===store.activeId?'aria-current="page"':''}><strong>${escape(conversationTitle(item))}</strong><span>${escape(new Date(item.updatedAt).toLocaleString([], {dateStyle:'medium',timeStyle:'short'}))}</span></button>`).join('')}
function renderTree(){if(!treeList)return;const conversation=activeConversation();const activeIds=new Set(history.map(item=>item.id));treeList.innerHTML=conversationTreeRows(conversation).map(({node,depth})=>`<button type="button" class="tree-node" data-tree-node="${escape(node.id)}" style="--tree-depth:${depth}" ${activeIds.has(node.id)?'data-active-path="true"':''} ${node.id===conversation.activeLeafId?'aria-current="true"':''}><span>${node.role==='user'?'You':'Operator'}</span><strong>${escape(String(node.content||'').replace(/\s+/g,' ').slice(0,72)||'…')}</strong></button>`).join('')||'<p>No messages in this conversation yet.</p>'}
function operatorBusy(){return Boolean(form.querySelector('button[type="submit"]')?.disabled)}
function branchTools(item){if(!item?.id)return'';const siblings=conversationSiblings(activeConversation(),item.id);const index=siblings.findIndex(node=>node.id===item.id);const previous=index>0?siblings[index-1]:null;const next=index>=0&&index<siblings.length-1?siblings[index+1]:null;return `<div class="message-branch-tools"><button type="button" data-branch-from="${escape(item.id)}">Branch here</button>${siblings.length>1?`<span><button type="button" data-switch-node="${escape(previous?.id||'')}" ${previous?'':'disabled'} aria-label="Previous branch">←</button><small>${index+1}/${siblings.length}</small><button type="button" data-switch-node="${escape(next?.id||'')}" ${next?'':'disabled'} aria-label="Next branch">→</button></span>`:''}</div>`}
function render({forceLatest=false}={}) {
  const shouldFollow=forceLatest||atLatest();
  log.innerHTML=history.map((item,index)=>`<article class="message ${item.role}${item.streaming?' is-streaming':''}" data-node-id="${escape(item.id||'')}"><span>${item.role==='user'?'You':'Operator'}</span><div class="message-content" data-message-index="${index}"></div>${item.actionUrl?`<a class="message-action" href="${escape(item.actionUrl)}">Open ${escape(item.actionLabel||'workspace')} →</a>`:''}${item.role==='assistant'&&index===history.length-1?`<div class="follow-ups" aria-label="Suggested next steps">${(item.suggestions||[]).map((suggestion,suggestionIndex)=>`<button type="button" data-suggestion="${escape(suggestion)}" style="--suggestion-index:${suggestionIndex}">${escape(suggestion)}</button>`).join('')}</div>`:''}${item.streaming?'':branchTools(item)}</article>`).join('');
  log.querySelectorAll('[data-message-index]').forEach(node=>{
    const item=history[Number(node.dataset.messageIndex)];
    if(!item)return;
    if(item.role==='assistant')paintOperatorMarkdown(node,item.content);
    else node.textContent=item.content;
  });
  renderHistory();
  renderTree();
  shouldFollow?followLatest():updateLatest();
}
function save({renderPage=true}={}){const conversation=activeConversation();conversation.updatedAt=now();store.conversations=store.conversations.filter(item=>item.messages.length||item.id===store.activeId).sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0,50);localStorage.setItem(KEY,JSON.stringify(store));if(KEY!==BASE_KEY)localStorage.removeItem(BASE_KEY);localStorage.removeItem(LEGACY_KEY);if(renderPage)render();accountSync.save(store)}

let streamingPaintTimer=0;
function paintStreamingMessage(message){
  streamingPaintTimer=0;
  const messages=log.querySelectorAll('.message.assistant');
  const article=messages[messages.length-1];
  const content=article?.querySelector('.message-content');
  if(!content)return;
  const shouldFollow=atLatest();
  paintOperatorMarkdown(content,message.content);
  if(shouldFollow)requestAnimationFrame(()=>scrollLatest());
}
function queueStreamingPaint(message){
  if(streamingPaintTimer)return;
  streamingPaintTimer=window.setTimeout(()=>paintStreamingMessage(message),90);
}
function flushStreamingPaint(message){
  if(streamingPaintTimer){window.clearTimeout(streamingPaintTimer);streamingPaintTimer=0}
  paintStreamingMessage(message);
}
async function syncHistory(){if(historySyncPromise)return historySyncPromise;if(!store.conversations.some(item=>item.messages.length)){historyEmpty.hidden=false;historyEmpty.textContent='Loading conversations…'}historySyncPromise=(async()=>{const remoteStore=await accountSync.load(store);if(remoteStore){while(operatorBusy())await new Promise(resolve=>setTimeout(resolve,100));store=mergeOperatorStores(store,remoteStore);if(requestedConversation&&store.conversations.some(item=>item.id===requestedConversation))store.activeId=requestedConversation;refreshHistory();localStorage.setItem(KEY,JSON.stringify(store));render({forceLatest:store.activeId===requestedConversation});void accountSync.save(store)}historySyncComplete=true;renderHistory();return remoteStore})().finally(()=>{historySyncPromise=null});return historySyncPromise}
function closeHistory(){historyPanel.hidden=true;showHistory.setAttribute('aria-expanded','false')}
function openHistory(){historyPanel.hidden=false;showHistory.setAttribute('aria-expanded','true');closeTree();void syncHistory();historyList.querySelector('[aria-current="page"]')?.focus()||document.querySelector('#close-history').focus()}
function closeTree(){if(!treePanel)return;treePanel.hidden=true;showTree?.setAttribute('aria-expanded','false')}
function openTree(){if(!treePanel)return;treePanel.hidden=false;showTree?.setAttribute('aria-expanded','true');closeHistory();renderTree();treeList.querySelector('[aria-current="true"]')?.focus()||document.querySelector('#close-tree')?.focus()}
async function createDeveloperProofWithRetry() {
  const delays = [0, 700, 1600];
  let lastError = null;
  for (const delay of delays) {
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    try {
      const proof = await createOperatorDeveloperProof();
      if (proof) return proof;
    } catch (error) {
      lastError = error;
    }
  }
  if (lastError) throw lastError;
  return null;
}
async function requestOperator(payload,handlers={}){
  const send=body=>fetch('/api/openai-site?provider=operator',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,stream:true})});
  let response=await send(payload);
  if(response.status===429){await new Promise(resolve=>setTimeout(resolve,700));response=await send(payload)}
  if(response.status===429){await new Promise(resolve=>setTimeout(resolve,1400));response=await send(payload)}
  if(response.status===503&&openaiKey) response=await send({...payload,apiKey:openaiKey});
  return readOperatorStream(response,handlers);
}
form.addEventListener('submit',async event=>{event.preventDefault();const prompt=input.value.trim();const images=attachments.getPayload();if(!prompt&&!images.length)return;const prior=history.map(({role,content})=>({role,content}));const historyPrompt=images.length?`${prompt}${prompt?'\n\n':''}[Attached screenshot: ${images[0].name}]`:prompt;appendConversationNode(activeConversation(),{role:'user',content:historyPrompt},{makeId,now});refreshHistory();input.value='';save({renderPage:false});const streamingMessage=appendConversationNode(activeConversation(),{role:'assistant',content:'',streaming:true},{makeId,now});refreshHistory();render({forceLatest:true});status.textContent='Connecting…';form.querySelector('button[type="submit"]').disabled=true;
try{const [portalContext,developerAuth,memoryContext]=await Promise.all([collectPortalContext(),createDeveloperProofWithRetry(),recallOperatorMemoryBestEffort(prompt||'Please analyze the attached screenshot.')]);portalContext.page=pageContext;const data=await requestOperator({prompt:prompt||'Please analyze the attached screenshot.',images,history:prior,portalContext,developerAuth,memoryContext},{onStatus:message=>{status.textContent=message},onReplyDelta:delta=>{streamingMessage.content+=delta;queueStreamingPaint(streamingMessage);status.textContent='Operator is responding…'}});let outcome=null;if(data.action?.type!=='none')outcome=await runOperatorAction(data.action,{developerAccess:data.developerAccess,onStatus:message=>{status.textContent=message}});const lifeSpaceActions=new Set(['create_note','create_checklist','save_link']);streamingMessage.content=[data.reply || streamingMessage.content,outcome?.message].filter(Boolean).join('\n\n');streamingMessage.suggestions=Array.isArray(data.suggestions)?data.suggestions:[];streamingMessage.actionUrl=forgeUrlWithReturn(outcome?.url||'',store.activeId);streamingMessage.actionLabel=lifeSpaceActions.has(data.action?.type)?'Life Space':data.action?.type==='add_lead'?'Lead Finder':'workspace';delete streamingMessage.streaming;flushStreamingPaint(streamingMessage);attachments.clear();save();void rememberOperatorTurnBestEffort({conversationId:store.activeId,prompt:historyPrompt,reply:streamingMessage.content,subject:conversationTitle(activeConversation())});
if(outcome?.backgroundTask){status.textContent='Tracking delegated work…';void watchOperatorActionOutcome(outcome,{onStatus:message=>{if(history[history.length-1]===streamingMessage)status.textContent=message},onUpdate:update=>{streamingMessage.content=[data.reply,update.message].filter(Boolean).join('\n\n');if(history[history.length-1]===streamingMessage)flushStreamingPaint(streamingMessage);save({renderPage:false});if(update.terminal)void rememberOperatorTurnBestEffort({conversationId:store.activeId,prompt:historyPrompt,reply:streamingMessage.content,subject:conversationTitle(activeConversation())})}}).catch(()=>{if(history[history.length-1]===streamingMessage)status.textContent='Task is still queued. Open the task if you need deeper detail.'})}else{status.textContent='Ready'}}catch(error){streamingMessage.content=streamingMessage.content?`${streamingMessage.content}\n\nI could not finish that: ${error.message}`:`I could not finish that: ${error.message}`;delete streamingMessage.streaming;flushStreamingPaint(streamingMessage);save();status.textContent='Try again';}finally{form.querySelector('button[type="submit"]').disabled=false;input.focus()}});
input.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();if(!operatorBusy())form.requestSubmit()}});
document.querySelector('.quick-prompts').addEventListener('click',event=>{const button=event.target.closest('[data-prompt]');if(!button)return;input.value=button.dataset.prompt;form.requestSubmit()});
log.addEventListener('click',event=>{const suggestion=event.target.closest('[data-suggestion]');if(suggestion){input.value=suggestion.dataset.suggestion;form.requestSubmit();return}const branch=event.target.closest('[data-branch-from]');if(branch){if(operatorBusy()){status.textContent='Finish the current reply before switching branches';return}selectConversationNode(activeConversation(),branch.dataset.branchFrom);refreshHistory();save();status.textContent='Branch point selected · your next message starts a new branch';input.focus();return}const switcher=event.target.closest('[data-switch-node]');if(switcher?.dataset.switchNode){if(operatorBusy()){status.textContent='Finish the current reply before switching branches';return}selectConversationNode(activeConversation(),switcher.dataset.switchNode,{followDescendants:true});refreshHistory();save();status.textContent='Switched branch';}});
document.querySelector('#clear-chat').onclick=()=>{store.conversations=store.conversations.filter(item=>item.messages.length);store.activeId=makeId();refreshHistory();save();closeHistory();closeTree();input.focus()};
showHistory.onclick=openHistory;
document.querySelector('#close-history').onclick=()=>{closeHistory();showHistory.focus()};
showTree.onclick=openTree;
document.querySelector('#close-tree').onclick=()=>{closeTree();showTree.focus()};
treeList.onclick=event=>{const button=event.target.closest('[data-tree-node]');if(!button)return;if(operatorBusy()){status.textContent='Finish the current reply before moving in the tree';closeTree();return}selectConversationNode(activeConversation(),button.dataset.treeNode);refreshHistory();save();closeTree();status.textContent='Moved to that point · continue here or choose Branch here';input.focus()};
historyList.onclick=event=>{const button=event.target.closest('[data-conversation-id]');if(!button)return;store.activeId=button.dataset.conversationId;refreshHistory();localStorage.setItem(KEY,JSON.stringify(store));render({forceLatest:true});closeHistory();closeTree();input.focus()};
log.addEventListener('scroll',updateLatest,{passive:true});
latest.onclick=()=>scrollLatest('smooth');
window.addEventListener('pageshow',()=>{atLatest()?followLatest():updateLatest()});
function consumeOperatorPrefill(){let value=null;try{value=JSON.parse(sessionStorage.getItem(OPERATOR_PREFILL_KEY)||'null')}catch{}sessionStorage.removeItem(OPERATOR_PREFILL_KEY);const prompt=String(value?.prompt||'').trim().slice(0,4000);if(!prompt)return false;input.value=prompt;if(value?.submit===true)requestAnimationFrame(()=>form.requestSubmit());return true}
render({forceLatest:true});
const prefilled=consumeOperatorPrefill();
if(new URLSearchParams(window.location.search).get('history')==='1') openHistory(); else if(!prefilled) input.focus();
void syncHistory();
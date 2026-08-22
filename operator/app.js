import { runOperatorAction } from './actions.js';
import { collectPortalContext } from './portal-context.js';
import { readDefaultSecret } from '../web-builder-app/defaults.js';
import { createOperatorSync, mergeOperatorStores } from './sync.js';

const form=document.querySelector('#operator-form'), input=document.querySelector('#operator-input'), log=document.querySelector('#operator-log'), status=document.querySelector('#operator-status'), syncStatus=document.querySelector('#operator-sync'), latest=document.querySelector('#operator-latest'), historyPanel=document.querySelector('#conversation-history'), historyList=document.querySelector('#history-list'), historyEmpty=document.querySelector('#history-empty'), showHistory=document.querySelector('#show-history');
window.AuthIdentity?.syncStorageFromSharedIdentity?.(localStorage);
const LEGACY_KEY='3dvr.operator.history.v1', BASE_KEY='3dvr.operator.conversations.v2';
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
function activeConversation(){let conversation=store.conversations.find(item=>item.id===store.activeId);if(!conversation){conversation={id:store.activeId,createdAt:now(),updatedAt:now(),messages:[]};store.conversations.push(conversation)}return conversation}
let history=activeConversation().messages;
let openaiKey='';const gun=window.Gun?window.Gun({peers:window.__GUN_PEERS__||undefined}):null;gun?.get('3dvr-portal')?.get('ai-workbench')?.get('defaults')?.on(data=>{openaiKey=readDefaultSecret(data,'openai')||openaiKey});
const accountSync=createOperatorSync({windowObj:window,onStatus:message=>{syncStatus.textContent=message}});
const escape=value=>String(value||'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
function atLatest(){return log.scrollHeight-log.scrollTop-log.clientHeight<48}
function updateLatest(){latest.hidden=!history.length||atLatest()}
function scrollLatest(behavior='auto'){log.scrollTo({top:log.scrollHeight,behavior});updateLatest()}
function followLatest(){requestAnimationFrame(()=>{scrollLatest();setTimeout(()=>{if(atLatest())scrollLatest()},100)})}
function conversationTitle(conversation){const first=conversation.messages.find(item=>item.role==='user')?.content||'New conversation';return first.length>52?`${first.slice(0,52).trim()}…`:first}
function renderHistory(){const saved=store.conversations.filter(item=>item.messages.length).sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)));historyEmpty.hidden=Boolean(saved.length);historyList.innerHTML=saved.map(item=>`<button type="button" data-conversation-id="${escape(item.id)}" ${item.id===store.activeId?'aria-current="page"':''}><strong>${escape(conversationTitle(item))}</strong><span>${escape(new Date(item.updatedAt).toLocaleString([], {dateStyle:'medium',timeStyle:'short'}))}</span></button>`).join('')}
function render({forceLatest=false}={}){const shouldFollow=forceLatest||atLatest();log.innerHTML=history.map((item,index)=>`<article class="message ${item.role}"><span>${item.role==='user'?'You':'Operator'}</span><p>${escape(item.content)}</p>${item.actionUrl?`<a href="${escape(item.actionUrl)}">Open ${escape(item.actionLabel||'workspace')} →</a>`:''}${item.role==='assistant'&&index===history.length-1&&item.suggestions?.length?`<div class="follow-ups" aria-label="Suggested next steps">${item.suggestions.map(suggestion=>`<button type="button" data-suggestion="${escape(suggestion)}">${escape(suggestion)}</button>`).join('')}</div>`:''}</article>`).join('');renderHistory();shouldFollow?followLatest():updateLatest()}
function save(){const conversation=activeConversation();conversation.messages=history.slice(-40);conversation.updatedAt=now();store.conversations=store.conversations.filter(item=>item.messages.length||item.id===store.activeId).sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0,50);localStorage.setItem(KEY,JSON.stringify(store));if(KEY!==BASE_KEY)localStorage.removeItem(BASE_KEY);localStorage.removeItem(LEGACY_KEY);render();accountSync.save(store)}
function closeHistory(){historyPanel.hidden=true;showHistory.setAttribute('aria-expanded','false')}
async function requestOperator(payload){
  const send=body=>fetch('/api/openai-site?provider=operator',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  let response=await send(payload);
  if(response.status===503&&openaiKey) response=await send({...payload,apiKey:openaiKey});
  return response;
}
form.addEventListener('submit',async event=>{event.preventDefault();const prompt=input.value.trim();if(!prompt)return;const prior=history.map(({role,content})=>({role,content}));history.push({role:'user',content:prompt});input.value='';save();status.textContent='Working…';form.querySelector('button').disabled=true;
try{const portalContext=await collectPortalContext();const response=await requestOperator({prompt,history:prior,portalContext});const data=await response.json();if(!response.ok)throw new Error(data.error||'Operator request failed.');let outcome=null;if(data.action?.type!=='none')outcome=await runOperatorAction(data.action);const lifeSpaceActions=new Set(['create_note','create_checklist','save_link']);history.push({role:'assistant',content:[data.reply,outcome?.message].filter(Boolean).join('\n\n'),suggestions:Array.isArray(data.suggestions)?data.suggestions:[],actionUrl:outcome?.url||'',actionLabel:lifeSpaceActions.has(data.action?.type)?'Life Space':data.action?.type==='add_lead'?'Lead Finder':'workspace'});save();status.textContent='Ready';}catch(error){history.push({role:'assistant',content:`I could not finish that: ${error.message}`});save();status.textContent='Try again';}finally{form.querySelector('button').disabled=false;input.focus()}});
input.addEventListener('keydown',event=>{if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)){event.preventDefault();form.requestSubmit()}});
document.querySelector('.quick-prompts').addEventListener('click',event=>{const button=event.target.closest('[data-prompt]');if(!button)return;input.value=button.dataset.prompt;form.requestSubmit()});
log.addEventListener('click',event=>{const button=event.target.closest('[data-suggestion]');if(!button)return;input.value=button.dataset.suggestion;form.requestSubmit()});
document.querySelector('#clear-chat').onclick=()=>{store.conversations=store.conversations.filter(item=>item.messages.length);store.activeId=makeId();history=activeConversation().messages;save();closeHistory();input.focus()};
showHistory.onclick=()=>{historyPanel.hidden=false;showHistory.setAttribute('aria-expanded','true');historyList.querySelector('[aria-current="page"]')?.focus()||document.querySelector('#close-history').focus()};
document.querySelector('#close-history').onclick=()=>{closeHistory();showHistory.focus()};
historyList.onclick=event=>{const button=event.target.closest('[data-conversation-id]');if(!button)return;store.activeId=button.dataset.conversationId;history=activeConversation().messages;localStorage.setItem(KEY,JSON.stringify(store));render({forceLatest:true});closeHistory();input.focus()};
log.addEventListener('scroll',updateLatest,{passive:true});
latest.onclick=()=>scrollLatest('smooth');
window.addEventListener('pageshow',()=>{atLatest()?followLatest():updateLatest()});
render({forceLatest:true});input.focus();
void accountSync.load(store).then(remoteStore=>{if(!remoteStore)return;store=mergeOperatorStores(store,remoteStore);history=activeConversation().messages;localStorage.setItem(KEY,JSON.stringify(store));render();accountSync.save(store)});

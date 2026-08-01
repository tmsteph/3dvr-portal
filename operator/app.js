import { runOperatorAction } from './actions.js';
import { readDefaultSecret } from '../web-builder-app/defaults.js';
const form=document.querySelector('#operator-form'), input=document.querySelector('#operator-input'), log=document.querySelector('#operator-log'), status=document.querySelector('#operator-status');
const KEY='3dvr.operator.history.v1'; let history=[]; try{history=JSON.parse(localStorage.getItem(KEY)||'[]')}catch{}
let openaiKey='';const gun=window.Gun?window.Gun({peers:window.__GUN_PEERS__||undefined}):null;gun?.get('3dvr-portal')?.get('ai-workbench')?.get('defaults')?.on(data=>{openaiKey=readDefaultSecret(data,'openai')||openaiKey});
const escape=value=>String(value||'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
function render(){log.innerHTML=history.map(item=>`<article class="message ${item.role}"><span>${item.role==='user'?'You':'Operator'}</span><p>${escape(item.content)}</p>${item.actionUrl?`<a href="${escape(item.actionUrl)}">Open ${escape(item.actionLabel||'workspace')} →</a>`:''}</article>`).join('');log.scrollTop=log.scrollHeight}
function save(){localStorage.setItem(KEY,JSON.stringify(history.slice(-40)));render()}
async function requestOperator(payload){
  const send=body=>fetch('/api/openai-site?provider=operator',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  let response=await send(payload);
  if(response.status===503&&openaiKey) response=await send({...payload,apiKey:openaiKey});
  return response;
}
form.addEventListener('submit',async event=>{event.preventDefault();const prompt=input.value.trim();if(!prompt)return;const prior=history.map(({role,content})=>({role,content}));history.push({role:'user',content:prompt});input.value='';save();status.textContent='Working…';form.querySelector('button').disabled=true;
try{const response=await requestOperator({prompt,history:prior});const data=await response.json();if(!response.ok)throw new Error(data.error||'Operator request failed.');let outcome=null;if(data.action?.type!=='none')outcome=await runOperatorAction(data.action);history.push({role:'assistant',content:[data.reply,outcome?.message].filter(Boolean).join('\n\n'),actionUrl:outcome?.url||'',actionLabel:data.action?.type==='create_note'?'Life Space':data.action?.type==='add_lead'?'Lead Finder':'workspace'});save();status.textContent='Ready';}catch(error){history.push({role:'assistant',content:`I could not finish that: ${error.message}`});save();status.textContent='Try again';}finally{form.querySelector('button').disabled=false;input.focus()}});
input.addEventListener('keydown',event=>{if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)){event.preventDefault();form.requestSubmit()}});
document.querySelector('#clear-chat').onclick=()=>{history=[];save();input.focus()};
render();input.focus();

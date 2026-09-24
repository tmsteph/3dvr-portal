const peers=Array.isArray(window.__GUN_PEERS__)&&window.__GUN_PEERS__.length?window.__GUN_PEERS__:['wss://gun-relay-3dvr.fly.dev/gun'];
const gun=typeof window.Gun==='function'?window.Gun({peers}):null;
const user=gun?.user?.();
const $=id=>document.getElementById(id);
const status=$('status'),authGate=$('authGate'),app=$('signedInApp'),list=$('dropList'),form=$('dropForm'),input=$('dropInput'),sync=$('syncState');
let node=null,secret='',state={version:1,updatedAt:0,items:[]},applying=false;

const builtin=$('bootstrapText').textContent.trim();
const copy=async text=>{try{await navigator.clipboard.writeText(text);return true}catch{return false}};
document.addEventListener('click',async e=>{const b=e.target.closest('[data-copy-target]');if(!b)return;const el=$(b.dataset.copyTarget);const text=el?.textContent||'';if(await copy(text)){const old=b.textContent;b.textContent='Copied';setTimeout(()=>b.textContent=old,900)}else prompt('Copy this:',text)});

function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function render(){list.innerHTML=state.items.length?state.items.map((x,i)=>`<article class="card drop"><pre id="drop-${i}">${esc(x.text)}</pre><div class="card-head"><span class="meta">${new Date(x.createdAt).toLocaleString()}</span><button class="copy" data-copy-target="drop-${i}">Copy</button></div></article>`).join(''):'<div class="empty">No personal drops yet.</div>'}
async function encrypt(){return SEA.encrypt(JSON.stringify(state),secret)}
async function decrypt(payload){const v=await SEA.decrypt(payload,secret);if(!v)return null;return typeof v==='string'?JSON.parse(v):v}
async function save(){if(!node||applying)return;state.updatedAt=Date.now();sync.textContent='saving…';const payload=await encrypt();node.put({version:1,payload,updatedAt:state.updatedAt},ack=>sync.textContent=ack?.err?'offline':'synced')}
async function apply(record){if(!record?.payload||Number(record.updatedAt||0)<state.updatedAt)return;const v=await decrypt(record.payload);if(!v)return;applying=true;state={version:1,updatedAt:Number(v.updatedAt||record.updatedAt||0),items:Array.isArray(v.items)?v.items.slice(0,25):[]};render();applying=false;sync.textContent='synced'}
form.addEventListener('submit',e=>{e.preventDefault();const text=input.value.trim();if(!text)return;state.items.unshift({text,createdAt:new Date().toISOString()});state.items=state.items.slice(0,25);input.value='';render();save()});

async function boot(){
  try{window.AuthIdentity?.syncStorageFromSharedIdentity?.()}catch{}
  const alias=(localStorage.getItem('alias')||'').trim();
  const password=localStorage.getItem('password')||'';
  const signed=localStorage.getItem('signedIn')==='true';
  if(!gun||!user||!window.SEA||!signed||!alias||!password){status.textContent='guest';return}
  status.textContent='unlocking…';
  secret=await SEA.work(password,`3dvr-drop:${alias}`);
  user.auth(alias,password,ack=>{
    if(ack?.err){status.textContent='sign in again';return}
    authGate.hidden=true;app.hidden=false;status.textContent=alias;node=user.get('drop-v1').get('state');
    let resolved=false;
    node.once(async record=>{resolved=true;if(record?.payload)await apply(record);else{state.items=[{text:builtin,createdAt:new Date().toISOString()}];render();await save()}node.on(apply)});
    setTimeout(()=>{if(!resolved){sync.textContent='relay slow';node.on(apply)}},4000);
  });
}
boot().catch(()=>status.textContent='offline');


async function dropSnapshot(){
  const stamp=Date.now();
  const urls=[
    '/drop/index.html?watch='+stamp,
    '/drop/main.js?watch='+stamp,
    '/drop/styles.css?watch='+stamp
  ];
  const parts=await Promise.all(urls.map(async url=>{
    const res=await fetch(url,{cache:'no-store'});
    if(!res.ok)throw new Error('watch fetch failed');
    return res.text();
  }));
  return parts.join('\n---3DVR-DROP-ASSET---\n');
}
async function watchDeployment(){
  let current='';
  try{current=await dropSnapshot()}catch{return}
  setInterval(async()=>{
    try{
      const next=await dropSnapshot();
      if(next===current)return;
      if(input?.value?.trim()){
        status.textContent='update ready';
        return;
      }
      status.textContent='updating…';
      location.reload();
    }catch{}
  },10000);
}
watchDeployment();

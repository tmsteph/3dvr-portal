import { ensureConversationTree } from './conversation-tree.js';

const SYNC_NODE='operator-v01';

const delay=(windowObj,ms)=>new Promise(resolve=>windowObj.setTimeout(resolve,ms));
const once=(node,windowObj)=>new Promise(resolve=>{
  let settled=false;
  const finish=value=>{if(settled)return;settled=true;windowObj.clearTimeout?.(timer);resolve(value)};
  const timer=windowObj.setTimeout(()=>finish(null),3500);
  try{node.once(finish)}catch{finish(null)}
});
const put=(node,value,windowObj)=>new Promise(resolve=>{
  let settled=false;
  const finish=value=>{if(settled)return;settled=true;windowObj.clearTimeout?.(timer);resolve(value)};
  const timer=windowObj.setTimeout(()=>finish(false),5000);
  try{node.put(value,ack=>finish(Boolean(ack&&!ack.err)))}catch{finish(false)}
});
const deviceRecords=(node,windowObj)=>new Promise(resolve=>{
  const records=new Map();
  let chain;
  // Gun streams map entries independently; collect a bounded read, including late peers.
  const timer=windowObj.setTimeout(()=>{chain?.off?.();resolve([...records.values()])},3500);
  try{chain=node.map();chain.on((record,id)=>{if(record?.ciphertext)records.set(id,record)})}
  catch{windowObj.clearTimeout?.(timer);resolve([])}
});
const timestamp=value=>Number.isFinite(Date.parse(value||''))?Date.parse(value):0;

export function mergeOperatorStores(localStore={},remoteStore={}){
  const byId=new Map();
  const isTree=conversation=>conversation.messages.every(node=>node?.id&&Object.prototype.hasOwnProperty.call(node,'parentId'));
  const mergeConversation=incoming=>{
    if(!incoming?.id||!Array.isArray(incoming.messages))return;
    // Stable migration IDs prevent the same old linear message becoming a new branch on every device.
    incoming.messages.forEach((message,index)=>{if(!message.id)message.id=`${incoming.id}-legacy-${index}`});
    ensureConversationTree(incoming);
    const current=byId.get(incoming.id);
    if(!current){byId.set(incoming.id,incoming);return}
    const incomingIsNewer=timestamp(incoming.updatedAt)>=timestamp(current.updatedAt);
    if(!isTree(current)||!isTree(incoming)){
      byId.set(incoming.id,incomingIsNewer?incoming:current);
      return;
    }
    const nodeMap=new Map(current.messages.map(node=>[node.id,node]));
    for(const node of incoming.messages){
      const existing=nodeMap.get(node.id);
      if(!existing||incomingIsNewer)nodeMap.set(node.id,node);
    }
    const preferred=incomingIsNewer?incoming:current;
    byId.set(incoming.id,{
      ...current,
      ...incoming,
      createdAt:current.createdAt||incoming.createdAt,
      updatedAt:incomingIsNewer?incoming.updatedAt:current.updatedAt,
      activeLeafId:preferred.activeLeafId,
      messages:[...nodeMap.values()].sort((a,b)=>(a.order??0)-(b.order??0))
    });
  };
  for(const conversation of remoteStore.conversations||[])mergeConversation(structuredClone(conversation));
  for(const conversation of localStore.conversations||[])mergeConversation(structuredClone(conversation));
  for(const conversation of byId.values())ensureConversationTree(conversation);
  const requestedActive=localStore.activeId||remoteStore.activeId;
  const localActiveId=localStore.activeId||'';
  let conversations=[...byId.values()]
    .filter(item=>item.messages.length||item.id===localActiveId)
    .sort((a,b)=>timestamp(b.updatedAt)-timestamp(a.updatedAt));
  const activeId=conversations.some(item=>item.id===requestedActive)?requestedActive:(conversations[0]?.id||requestedActive||globalThis.crypto?.randomUUID?.()||`conversation-${Date.now()}`);
  return{activeId,conversations};
}

export function createOperatorSync({windowObj=window,onStatus=()=>{}}={}){
  let node=null,devices=null,writer=null,secret=null,ready=false;
  let saveQueue=Promise.resolve();
  const init=async()=>{
    if(typeof windowObj.Gun!=='function'||!windowObj.SEA)return false;
    try{
      windowObj.AuthIdentity?.syncStorageFromSharedIdentity?.(windowObj.localStorage);
      const gun=windowObj.Gun({peers:windowObj.__GUN_PEERS__||[]});
      const user=gun.user();
      user.recall?.({sessionStorage:true,localStorage:true});
      for(let attempt=0;attempt<12&&!user.is;attempt+=1)await delay(windowObj,150);
      if(!user.is?.pub){
        const alias=windowObj.localStorage?.getItem('alias')?.trim();
        const password=windowObj.localStorage?.getItem('password')||'';
        if(alias&&password&&typeof user.auth==='function'){
          await new Promise(resolve=>{
            let settled=false;
            const finish=()=>{if(settled)return;settled=true;resolve()};
            try{user.auth(alias,password,finish)}catch{finish()}
            windowObj.setTimeout(finish,5000);
          });
        }
      }
      secret=user?._?.sea||null;
      if(!user.is?.pub||!secret||typeof windowObj.SEA.encrypt!=='function'||typeof windowObj.SEA.decrypt!=='function'){
        onStatus('Saved on this device · Sign in to sync');
        return false;
      }
      const root=user.get(SYNC_NODE);
      node=root.get('conversations');
      // Keep legacy history readable; new writes use isolated encrypted snapshots per browser tab.
      devices=root.get('device-history');
      const storage=windowObj.sessionStorage||windowObj.localStorage;
      let writerId;
      try{writerId=storage?.getItem?.('3dvr.operator.sync-writer.v1')}catch{}
      if(!writerId){
        writerId=globalThis.crypto?.randomUUID?.()||`writer-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        try{storage?.setItem?.('3dvr.operator.sync-writer.v1',writerId)}catch{}
      }
      writer=devices.get(writerId);
      ready=true;
      onStatus('Account sync ready');
      return true;
    }catch{
      onStatus('Saved on this device');
      return false;
    }
  };
  const readyPromise=init();
  return{
    ready:readyPromise,
    async load(localStore){
      if(!(await readyPromise)||!node)return null;
      onStatus('Checking account history…');
      const [legacy,records]=await Promise.all([once(node,windowObj),deviceRecords(devices,windowObj)]);
      if(legacy?.ciphertext)records.unshift(legacy);
      let merged=localStore,loaded=false,unreadable=false;
      for(const record of records){
        try{
          const decoded=await windowObj.SEA.decrypt(record.ciphertext,secret);
          const remoteStore=typeof decoded==='string'?JSON.parse(decoded):decoded;
          if(!remoteStore||!Array.isArray(remoteStore.conversations)){unreadable=true;continue}
          merged=mergeOperatorStores(merged,remoteStore);
          loaded=true;
        }catch{unreadable=true}
      }
      onStatus(unreadable?'Some account history could not be opened':loaded?'Account history loaded':'Account sync ready');
      return loaded?merged:null;
    },
    save(store){
      // Snapshot now and serialize encryption/writes so an older reply cannot finish last.
      const snapshot=structuredClone(store);
      const task=saveQueue.then(async()=>{
        if(!(await readyPromise)||!writer)return false;
        try{
          const previous=await once(writer,windowObj);
          let merged=mergeOperatorStores(snapshot,{});
          if(previous?.ciphertext){
            const decoded=await windowObj.SEA.decrypt(previous.ciphertext,secret);
            const previousStore=typeof decoded==='string'?JSON.parse(decoded):decoded;
            if(!previousStore||!Array.isArray(previousStore.conversations))throw new Error('Invalid history');
            merged=mergeOperatorStores(merged,previousStore);
          }
          const ciphertext=await windowObj.SEA.encrypt(JSON.stringify(merged),secret);
          const saved=await put(writer,{schemaVersion:2,updatedAt:new Date().toISOString(),ciphertext},windowObj);
          // A Gun acknowledgement is not proof that a second device has downloaded the data.
          onStatus(saved?'Saved here · Account sync active':'Saved here · Sync will retry');
          return saved;
        }catch{
          onStatus('Saved here · Sync will retry');
          return false;
        }
      });
      saveQueue=task.catch(()=>false);
      return task;
    },
    isReady(){return ready}
  };
}

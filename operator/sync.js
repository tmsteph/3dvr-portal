const SYNC_NODE='operator-v01';

const delay=(windowObj,ms)=>new Promise(resolve=>windowObj.setTimeout(resolve,ms));
const once=(node,windowObj)=>new Promise(resolve=>{let settled=false;const finish=value=>{if(settled)return;settled=true;resolve(value)};try{node.once(finish);windowObj.setTimeout(()=>finish(null),2500)}catch{finish(null)}});
const put=(node,value)=>new Promise(resolve=>{try{node.put(value,ack=>resolve(!ack?.err))}catch{resolve(false)}});
const timestamp=value=>Number.isFinite(Date.parse(value||''))?Date.parse(value):0;

export function mergeOperatorStores(localStore={},remoteStore={}){
  const byId=new Map();
  for(const conversation of [...(remoteStore.conversations||[]),...(localStore.conversations||[])]){
    if(!conversation?.id||!Array.isArray(conversation.messages))continue;
    const current=byId.get(conversation.id);
    if(!current||timestamp(conversation.updatedAt)>=timestamp(current.updatedAt))byId.set(conversation.id,conversation);
  }
  const conversations=[...byId.values()].filter(item=>item.messages.length).sort((a,b)=>timestamp(b.updatedAt)-timestamp(a.updatedAt)).slice(0,50);
  const requestedActive=localStore.activeId||remoteStore.activeId;
  const activeId=conversations.some(item=>item.id===requestedActive)?requestedActive:(conversations[0]?.id||requestedActive||globalThis.crypto?.randomUUID?.()||`conversation-${Date.now()}`);
  return{activeId,conversations};
}

export function createOperatorSync({windowObj=window,onStatus=()=>{}}={}){
  let node=null,secret=null,ready=false;
  const init=async()=>{
    if(typeof windowObj.Gun!=='function'||!windowObj.SEA)return false;
    try{
      windowObj.AuthIdentity?.syncStorageFromSharedIdentity?.(windowObj.localStorage);
      const gun=windowObj.Gun({peers:windowObj.__GUN_PEERS__||[]});
      const user=gun.user();
      user.recall?.({sessionStorage:true,localStorage:true});
      for(let attempt=0;attempt<12&&!user.is;attempt+=1)await delay(windowObj,150);
      secret=user?._?.sea||null;
      if(!user.is?.pub||!secret||typeof windowObj.SEA.encrypt!=='function'||typeof windowObj.SEA.decrypt!=='function'){
        onStatus('Saved on this device · Sign in to sync');
        return false;
      }
      node=user.get(SYNC_NODE).get('conversations');
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
      const record=await once(node,windowObj);
      if(!record?.ciphertext)return null;
      try{
        const decoded=await windowObj.SEA.decrypt(record.ciphertext,secret);
        const remoteStore=typeof decoded==='string'?JSON.parse(decoded):decoded;
        if(!remoteStore||!Array.isArray(remoteStore.conversations))return null;
        onStatus('Synced to your account');
        return mergeOperatorStores(localStore,remoteStore);
      }catch{
        onStatus('Account history could not be opened');
        return null;
      }
    },
    async save(store){
      if(!(await readyPromise)||!node)return false;
      try{
        const ciphertext=await windowObj.SEA.encrypt(JSON.stringify(store),secret);
        const saved=await put(node,{schemaVersion:1,updatedAt:new Date().toISOString(),ciphertext});
        onStatus(saved?'Synced to your account':'Saved here · Sync will retry');
        return saved;
      }catch{
        onStatus('Saved here · Sync will retry');
        return false;
      }
    },
    isReady(){return ready}
  };
}

import assert from 'node:assert/strict';
import test from 'node:test';
import { createOperatorSync, mergeOperatorStores } from '../operator/sync.js';

const conversation=(id,updatedAt,content)=>({id,createdAt:updatedAt,updatedAt,messages:[{role:'user',content}]});

test('operator account sync merges device and account conversations without losing newer edits',()=>{
  const local={activeId:'local',conversations:[conversation('local','2026-08-01T01:00:00Z','Local chat'),conversation('shared','2026-08-01T03:00:00Z','New local edit')]};
  const remote={activeId:'remote',conversations:[conversation('remote','2026-08-01T02:00:00Z','Remote chat'),conversation('shared','2026-08-01T02:30:00Z','Old remote edit')]};
  const merged=mergeOperatorStores(local,remote);
  assert.equal(merged.activeId,'local');
  assert.deepEqual(merged.conversations.map(item=>item.id),['shared','remote','local']);
  assert.equal(merged.conversations[0].messages[0].content,'New local edit');
});


test('operator account sync preserves the active local draft without truncating account history',()=>{
  const localActive={id:'local-active',createdAt:'2026-07-01T00:00:00Z',updatedAt:'2026-07-01T00:00:00Z',messages:[]};
  const remoteConversations=Array.from({length:50},(_,index)=>conversation(`remote-${index}`,`2026-08-${String((index%28)+1).padStart(2,'0')}T12:00:00Z`,`Remote ${index}`));
  const merged=mergeOperatorStores({activeId:'local-active',conversations:[localActive]},{activeId:'remote-0',conversations:remoteConversations});
  assert.equal(merged.activeId,'local-active');
  assert.equal(merged.conversations.length,51);
  assert.ok(merged.conversations.some(item=>item.id==='local-active'));
  assert.equal(merged.conversations.find(item=>item.id==='local-active').messages.length,0);
});

function sharedAccount() {
  const records=new Map();
  const chain=path=>({
    get(key){return chain(`${path}/${key}`)},
    once(callback){callback(records.get(path)||null)},
    put(value,callback){records.set(path,structuredClone(value));callback({ok:1})},
    map(){return {on(callback){for(const [key,value] of records)if(key.startsWith(`${path}/`))callback(value,key)},off(){}}}
  });
  const windowFor=(writerId,encrypt=async value=>`encrypted:${value}`)=>{
    const user={is:{pub:'account-pub'},_:{sea:{priv:'secret'}},recall(){},get(key){return chain(key)}};
    return {
      Gun(){return{user(){return user}}},
      SEA:{encrypt,async decrypt(value){return value.replace('encrypted:','')}},
      AuthIdentity:{syncStorageFromSharedIdentity(){}},
      localStorage:{getItem(){return null}},sessionStorage:{getItem(){return writerId}},__GUN_PEERS__:[],
      setTimeout(callback,ms){return setTimeout(callback,Math.min(ms,10))},clearTimeout
    };
  };
  return {records,windowFor};
}

test('operator account sync encrypts isolated snapshots without overwriting legacy history',async()=>{
  const account=sharedAccount();
  account.records.set('operator-v01/conversations',{ciphertext:'encrypted:'+JSON.stringify({conversations:[]})});
  const statuses=[];
  const sync=createOperatorSync({windowObj:account.windowFor('laptop'),onStatus:value=>statuses.push(value)});
  const store={activeId:'one',conversations:[conversation('one','2026-08-01T01:00:00Z','Private memory')]};
  assert.equal(await sync.save(store),true);
  const written=account.records.get('operator-v01/device-history/laptop');
  assert.match(written.ciphertext,/^encrypted:/);
  assert.match(written.ciphertext,/Private memory/);
  assert.equal(written.schemaVersion,2);
  assert.equal(account.records.get('operator-v01/conversations').ciphertext,'encrypted:{"conversations":[]}');
  assert.equal(statuses.at(-1),'Saved here · Account sync active');
});

test('two stale devices retain both chats after simultaneous saves and reloads',async()=>{
  const account=sharedAccount();
  const laptop=createOperatorSync({windowObj:account.windowFor('laptop')});
  const phone=createOperatorSync({windowObj:account.windowFor('phone')});
  const a={activeId:'laptop-chat',conversations:[conversation('laptop-chat','2026-10-07T10:00:00Z','Can you take notes?')]};
  const b={activeId:'phone-chat',conversations:[conversation('phone-chat','2026-10-07T10:01:00Z','Phone test')]};
  assert.deepEqual(await Promise.all([laptop.save(a),phone.save(b)]),[true,true]);
  for(const sync of [laptop,phone]){
    const loaded=await sync.load({conversations:[]});
    assert.deepEqual(new Set(loaded.conversations.map(item=>item.id)),new Set(['laptop-chat','phone-chat']));
  }
  // A stale cache from the same writer must not remove its previously published chats.
  await laptop.save(b);
  assert.equal((await phone.load({conversations:[]})).conversations.length,2);
});

test('queued saves snapshot their input and preserve messages when encryption finishes out of order',async()=>{
  const account=sharedAccount();
  let release;
  const firstEncryption=new Promise(resolve=>{release=resolve});
  let calls=0;
  const sync=createOperatorSync({windowObj:account.windowFor('laptop',async value=>{
    if(++calls===1)await firstEncryption;
    return `encrypted:${value}`;
  })});
  const store={activeId:'one',conversations:[conversation('one','2026-10-07T10:00:00Z','First')]};
  const first=sync.save(store);
  store.conversations.push(conversation('two','2026-10-07T10:01:00Z','Second'));
  const second=sync.save(store);
  await sync.ready;
  release();
  assert.deepEqual(await Promise.all([first,second]),[true,true]);
  assert.equal((await sync.load({conversations:[]})).conversations.length,2);
});

test('legacy linear history migrates to stable nodes on repeated merges',()=>{
  const old={activeId:'legacy',conversations:[conversation('legacy','2026-10-07T10:00:00Z','Old message')]};
  const once=mergeOperatorStores({},old);
  const twice=mergeOperatorStores(once,old);
  assert.equal(twice.conversations[0].messages.length,1);
  assert.equal(twice.conversations[0].messages[0].id,'legacy-legacy-0');
});

test('operator account sync merges branch nodes created on different devices',()=>{
  const sharedRoot={id:'root',parentId:null,role:'user',content:'Start',order:0};
  const sharedReply={id:'reply',parentId:'root',role:'assistant',content:'Answer',order:1};
  const localBranch={id:'local-branch',parentId:'reply',role:'user',content:'Local path',order:2};
  const remoteBranch={id:'remote-branch',parentId:'reply',role:'user',content:'Remote path',order:2};
  const local={activeId:'shared',conversations:[{id:'shared',createdAt:'2026-09-30T10:00:00Z',updatedAt:'2026-09-30T10:02:00Z',activeLeafId:'local-branch',messages:[sharedRoot,sharedReply,localBranch]}]};
  const remote={activeId:'shared',conversations:[{id:'shared',createdAt:'2026-09-30T10:00:00Z',updatedAt:'2026-09-30T10:01:00Z',activeLeafId:'remote-branch',messages:[sharedRoot,sharedReply,remoteBranch]}]};
  const merged=mergeOperatorStores(local,remote);
  const conversation=merged.conversations[0];
  assert.equal(conversation.activeLeafId,'local-branch');
  assert.deepEqual(new Set(conversation.messages.map(node=>node.id)),new Set(['root','reply','local-branch','remote-branch']));
});

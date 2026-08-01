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

test('operator account sync encrypts account history before writing it',async()=>{
  let written=null;
  const node={once(callback){callback(null)},put(value,callback){written=value;callback({ok:1})}};
  const user={is:{pub:'account-pub'},_:{sea:{priv:'secret'}},recall(){},get(){return{get(){return node}}}};
  const windowObj={
    Gun(){return{user(){return user}}},
    SEA:{async encrypt(value){return `encrypted:${value}`},async decrypt(value){return value.replace('encrypted:','')}},
    AuthIdentity:{syncStorageFromSharedIdentity(){}},localStorage:{},__GUN_PEERS__:[],setTimeout
  };
  const statuses=[];
  const sync=createOperatorSync({windowObj,onStatus:value=>statuses.push(value)});
  const store={activeId:'one',conversations:[conversation('one','2026-08-01T01:00:00Z','Private memory')]};
  assert.equal(await sync.save(store),true);
  assert.match(written.ciphertext,/^encrypted:/);
  assert.match(written.ciphertext,/Private memory/);
  assert.equal(statuses.at(-1),'Synced to your account');
});

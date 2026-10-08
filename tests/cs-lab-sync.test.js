import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeRegisters, stateFromRegisters } from '../cs-build-lab/account-sync.js';
const ids = ['complexity', 'structures'];
const record = (module, field, value, time, writer) => ({ module, field, value, time, writer });
test('independent device changes merge, including explicit unchecks and blank notes', () => {
  const old = {
    a: record('complexity', 'learn', true, 1, 'laptop'),
    b: record('complexity', 'notes', 'old', 1, 'laptop')
  };
  const phone = {
    a: record('complexity', 'learn', false, 2, 'phone'),
    b: record('structures', 'build', true, 2, 'phone'),
    c: record('complexity', 'notes', '', 2, 'phone')
  };
  const state = stateFromRegisters(mergeRegisters(old, phone, ids), ids);
  assert.equal(state.modules.complexity.steps.learn, false);
  assert.equal(state.modules.complexity.notes, '');
  assert.equal(state.modules.structures.steps.build, true);
  assert.deepEqual(mergeRegisters(old, phone, ids), mergeRegisters(phone, old, ids));
});
test('stale migration cannot resurrect remotely cleared progress', () => {
  const old = { a: record('complexity', 'learn', true, 0, 'legacy') };
  const remote = { a: record('complexity', 'learn', false, 5, 'phone') };
  assert.equal(stateFromRegisters(mergeRegisters(remote, old, ids), ids).modules.complexity.steps.learn, false);
});
test('invalid graph records are rejected and equal clocks resolve deterministically', () => {
  const a = { a: record('complexity', 'notes', 'one', 5, 'a') };
  const b = { b: record('complexity', 'notes', 'two', 5, 'b'), x: record('unknown', 'learn', true, 6, 'b'), y: record('complexity', 'learn', 'true', 6, 'b') };
  const registers = mergeRegisters(a, b, ids);
  assert.equal(registers['complexity:notes'].value, 'two');
  assert.equal(Object.keys(registers).length, 1);
});

import { createLabAccountSync } from '../cs-build-lab/account-sync.js';
function fixture(pub, values = new Map()) {
  const writes = [];
  const callbacks = [];
  let readable;
  const node = {
    get() { return this; },
    map() { return this; },
    on(callback) { readable = callback; return this; },
    off() {},
    put(value, done) { writes.push(value); done({err:'offline'}); }
  };
  const user = { is: {pub,alias:'learner'}, _: {sea:{pub}}, recall(){}, get(){return node;} };
  values.set('signedIn','true');
  values.set('alias','learner');
  values.set('userPubKey',pub);
  const windowObj = {
    Gun(){return {user(){return user;}}},
    SEA: {encrypt:async text=>'encrypted:'+text,decrypt:async text=>text,sign:async value=>value,verify:async value=>value},
    crypto:{randomUUID:()=>pub+'-writer'},
    localStorage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)},
    setTimeout,clearTimeout,
    setInterval(){return 1;},clearInterval(){}
  };
  const runtime = createLabAccountSync({
    windowObj,ids,getGuestState:()=>({version:1,modules:{complexity:{steps:{learn:true},notes:'guest draft'}}}),
    onState:s=>callbacks.push(s),onStatus(){}
  });
  return {runtime,values,writes,callbacks,receive:value=>readable(value)};
}
test('migration is account-scoped and failed writes preserve a retryable encrypted cache', async () => {
  const f = fixture('first');
  assert.equal(await f.runtime.ready,true);
  await f.runtime.save({version:1,modules:{complexity:{steps:{learn:false},notes:'private note'}}});
  assert.equal(f.values.get('3dvr.cs-build-lab.v1:migration-owner'),'first');
  const saved = JSON.parse(f.values.get('3dvr.cs-build-lab.v1:account:first'));
  assert.equal(saved.registers['complexity:notes'].value,'private note');
  assert.equal(f.values.has('3dvr.cs-build-lab.v1'),false);
  assert.ok(f.writes.every(w=>typeof w.ciphertext==='string' && !w.notes));
  f.runtime.stop();
  const second = fixture('second',f.values);
  assert.equal(await second.runtime.ready,true);
  assert.equal(second.callbacks[0].modules.complexity.notes,'');
  assert.equal(second.callbacks[0].modules.complexity.steps.learn,false);
  await second.runtime.save(second.callbacks[0]);
  second.runtime.stop();
});

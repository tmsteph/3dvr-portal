import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { HostedTaskStore } from '../src/operator-runtime/hosted-task-store.js';

const moduleUrl = new URL('../src/operator-runtime/hosted-task-store.js', import.meta.url).href;
const request = key => ({kind:'repo-status', repository:'tmsteph/3dvr-portal', idempotencyKey:key});
async function fixture(fn) {
  const dir = await mkdtemp(join(tmpdir(), 'hosted-budget-'));
  try { await fn(new HostedTaskStore(join(dir, 'tasks.json'))); }
  finally { await rm(dir, {recursive:true, force:true}); }
}

test('untrusted snapshots cannot fund spending', async () => {
  await fixture(async store => {
    assert.equal((await store.submit('alice', request('unfunded-key'),
      {remainingCents:999, reservationCents:1})).reason, 'budget_exhausted');
    assert.equal(await store.budget('alice'), null);
    assert.deepEqual(await store.read(), []);
  });
});
test('durable reservation and idempotency survive reopening', async () => {
  await fixture(async store => {
    await store.setBudget('alice', 1);
    assert.equal((await store.submit('alice', request('reserved-key'), {reservationCents:1})).ok, true);
    const reopened = new HostedTaskStore(store.path);
    assert.equal((await reopened.submit('alice', request('reserved-key'), {})).duplicate, true);
    assert.equal((await reopened.submit('alice', request('other-key'),
      {remainingCents:999, reservationCents:1})).reason, 'budget_exhausted');
    assert.deepEqual(await reopened.budget('alice'),
      {allowanceCents:1, reservedCents:1, accountedCents:0, remainingCents:0});
    assert.equal((await stat(store.databasePath)).mode & 0o777, 0o600);
  });
});
test('completion accounts once and stale workers cannot change spending', async () => {
  await fixture(async store => {
    await store.setBudget('alice', 2);
    const created = await store.submit('alice', request('complete-key'), {reservationCents:2});
    const old = await store.claim(created.task.id, 1);
    await store.recoverExpired(Date.now()+1000);
    const current = await store.claim(created.task.id);
    assert.equal(await store.complete(created.task.id, 'stale', old.leaseToken), false);
    assert.equal(await store.complete(created.task.id, 'done', current.leaseToken), true);
    assert.equal(await store.complete(created.task.id, 'double', current.leaseToken), false);
    assert.deepEqual(await store.budget('alice'),
      {allowanceCents:2, reservedCents:0, accountedCents:2, remainingCents:0});
    assert.equal((await store.get('alice', created.task.id)).usage.costBasis, 'reserved_upper_bound');
    await assert.rejects(store.setBudget('alice', 1), /budget_below_committed/);
    await store.setBudget('alice', 2);
    assert.equal((await store.budget('alice')).remainingCents, 0);
  });
});
test('terminal failures retain unknown spending and tenant budgets stay isolated', async () => {
  await fixture(async store => {
    for (const tenant of ['alice','bob']) await store.setBudget(tenant, 1);
    const a = await store.submit('alice', request('shared-key'), {reservationCents:1});
    const b = await store.submit('bob', request('shared-key'), {reservationCents:1});
    assert.equal(a.ok, true); assert.equal(b.ok, true);
    assert.equal(await store.get('bob', a.task.id), null);
    for (let i=0;i<3;i++) { await store.claim(a.task.id,1); await store.recoverExpired(Date.now()+1000); }
    assert.equal((await store.get('alice',a.task.id)).status,'failed');
    assert.equal((await store.budget('alice')).reservedCents,1);
    assert.equal((await store.submit('alice',request('retry-spend-key'),{reservationCents:1})).ok,false);
  });
});
test('four processes cannot reserve the same last cent', {timeout:15000}, async () => {
  await fixture(async store => {
    await store.setBudget('alice',1);
    const code = `import {HostedTaskStore} from ${JSON.stringify(moduleUrl)};
      const store=new HostedTaskStore(process.argv[1]);
      console.log(JSON.stringify(await store.submit('alice',{kind:'repo-status',repository:'tmsteph/3dvr-portal',
        idempotencyKey:process.argv[2]},{reservationCents:1})));`;
    const results=await Promise.all(Array.from({length:4},(_,i)=>new Promise((resolve,reject)=>{
      const child=spawn(process.execPath,['--input-type=module','-e',code,store.path,'parallel-key-'+i]);
      let output='',errors='';
      child.stdout.on('data',value=>{output+=value});child.stderr.on('data',value=>{errors+=value});
      child.on('error',reject);child.on('exit',status=>status===0?resolve(JSON.parse(output)):reject(new Error(errors)));
    })));
    assert.equal(results.filter(result=>result.ok).length,1);
    assert.equal((await store.read()).length,1);
    assert.equal((await store.budget('alice')).reservedCents,1);
  });
});
test('killed writer rolls back spending and releases its kernel lock', {timeout:15000}, async () => {
  await fixture(async store => {
    await store.setBudget('alice',1);
    const code=`import {DatabaseSync} from 'node:sqlite';const db=new DatabaseSync(process.argv[1]);
      db.exec("BEGIN IMMEDIATE; UPDATE budgets SET accounted=1 WHERE tenant='alice'");
      process.send('locked');setInterval(()=>{},1000);`;
    const child=spawn(process.execPath,['--input-type=module','-e',code,store.databasePath],
      {stdio:['ignore','ignore','pipe','ipc']});
    try {
      await once(child,'message');const exited=once(child,'exit');child.kill('SIGKILL');await exited;
      assert.equal((await new HostedTaskStore(store.path).budget('alice')).accountedCents,0);
      assert.equal((await store.submit('alice',request('after-kill-key'),{reservationCents:1})).ok,true);
    } finally {child.kill('SIGKILL');}
  });
});
test('legacy state and unknown locks fail closed without deletion', async () => {
  await fixture(async store => {
    await writeFile(store.path,JSON.stringify([{id:'legacy',tenantId:'alice',status:'queued'}]));
    await assert.rejects(store.read(),/legacy_migration_required/);
    await writeFile(store.path+'.lock','unknown owner');
    await assert.rejects(store.read(),/legacy_task_store_locked/);
  });
});
test('malformed and oversized reservations cannot advance spending', async () => {
  await fixture(async store => {
    for (const value of [-1,NaN,'10',1.5,Number.MAX_SAFE_INTEGER+1])
      await assert.rejects(store.setBudget('alice',value),/invalid_budget/);
    await store.setBudget('alice',2);
    for (const value of [0,-1,NaN,'1',1.5]) assert.equal((await store.submit('alice',request('bad-reserve-key'),
      {reservationCents:value})).reason,'invalid_reservation');
    assert.equal((await store.submit('alice',request('over-budget-key'),{reservationCents:3})).reason,'budget_exhausted');
    assert.equal((await store.budget('alice')).reservedCents,0);
  });
});

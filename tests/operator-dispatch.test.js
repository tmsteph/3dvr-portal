import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import SEA from 'gun/sea.js';
import { createOperatorDispatchHandler, runManagedQueue, REMOTE_QUEUE_SCRIPT } from '../src/operator-runtime/dispatch.js';
import { publishPrivateWorkerHeartbeat } from '../scripts/ops/operator-private-worker.cjs';
import * as sqliteStore from '../apps/agent/thomas-agent/node/task-queue-sqlite-store.js';
import { queueOperatorTask, watchOperatorTask, operatorTaskReceipt, isOperatorTaskTerminal, operatorTaskProgress } from '../operator/delegate-task.js';

const origin = 'https://operator.3dvr.tech';
const pair = await SEA.pair();
const config = {THREEDVR_OPERATOR_OWNER_BINDINGS:JSON.stringify({'tmsteph@3dvr':pair.pub})};
async function request(handler, data, signer = pair, extra = {}) {
  const body = {...data,authPub:signer.pub,authProof:await SEA.sign({...data,scope:'operator-runtime-task',pub:signer.pub,origin,iat:Date.now()},signer),...extra};
  const res = {setHeader(){},end(raw){this.data=JSON.parse(raw);}};
  await handler({method:'POST',headers:{origin},body},res);
  return res;
}
const enqueue = {action:'enqueue',requestId:'diagnostic-request-123',text:'Calculate 6 times 7. Make no changes.',title:'Arithmetic'};

test('signed dispatch fails closed without an explicitly selected queue host', () => {
  let spawned = false;
  const spawn = () => { spawned = true; throw Error('unexpected SSH attempt'); };
  for (const host of [undefined, '', '   ']) {
    assert.throws(() => runManagedQueue({action:'status',id:'synthetic'}, {
      config: host === undefined ? {} : {THREEDVR_OPERATOR_TASK_SSH_HOST:host}, spawn
    }), /must be explicitly configured/);
  }
  assert.equal(spawned,false,'missing host must never fall back to an unverified server');
});

test('real signed requests enqueue only bounded Codex tasks and isolate status by signer', async () => {
  const inputs = [];
  const handler = createOperatorDispatchHandler({config,run:async input => {inputs.push(input);return {ok:true,record:{id:input.id,status:'queued'}};}});
  assert.equal((await request(handler,enqueue)).statusCode,202);
  assert.equal(inputs[0].record.backend,'codex');
  assert.equal(inputs[0].record.requiredCapabilities,'codex');
  assert.equal(inputs[0].record.unsafe,false);
  assert.equal(inputs[0].record.approvalStatus,'not_required');
  assert.equal(inputs[0].record.maxRuntimeMs,120000);
  assert.equal((await request(handler,{action:'status',requestId:enqueue.requestId})).statusCode,200);
  assert.equal(inputs[0].id,inputs[1].id);
  assert.equal((await request(handler,enqueue,await SEA.pair())).statusCode,403);
  assert.equal(inputs.length,2);
});

test('unsigned, tampered, expired and wrong-origin requests never reach the queue', async () => {
  let calls = 0;
  const handler = createOperatorDispatchHandler({config,run:async () => {calls++;return {ok:true};}});
  assert.equal((await request(handler,enqueue,pair,{text:'Different task'})).statusCode,403);
  assert.equal((await request(handler,enqueue,pair,{authProof:''})).statusCode,401);
  const old = await SEA.sign({...enqueue,scope:'operator-runtime-task',pub:pair.pub,origin,iat:Date.now()-600000},pair);
  assert.equal((await request(handler,enqueue,pair,{authProof:old})).statusCode,401);
  const res={setHeader(){},end(){}};
  await handler({method:'POST',headers:{origin:'https://evil.example'},body:enqueue},res);
  assert.equal(res.statusCode,403);
  assert.equal(calls,0);
});

test('an interrupted queue transport reports uncertain delivery and never retries', async () => {
  let calls = 0;
  const handler = createOperatorDispatchHandler({config,run:async () => {calls++;throw Error('broken connection');}});
  const result=await request(handler,enqueue);
  assert.equal(result.statusCode,503);
  assert.match(result.data.error,/not confirmed/);
  assert.equal(calls,1);
});

test('actual SQLite transport is idempotent and preserves historical and running tasks', async () => {
  const dir=await mkdtemp(join(tmpdir(),'operator-dispatch-test-'));
  const dbPath=join(dir,'queue.sqlite');
  const db=new DatabaseSync(dbPath);
  db.exec('CREATE TABLE tasks(owner_alias TEXT,id TEXT,status TEXT,updated_at TEXT,record_json TEXT,source TEXT,PRIMARY KEY(owner_alias,id))');
  db.exec(`CREATE TABLE worker_heartbeats(owner_alias TEXT,worker_id TEXT,queue_store TEXT,capabilities TEXT,risk_classes TEXT,only_task_id TEXT NOT NULL DEFAULT '',observed_at INTEGER,PRIMARY KEY(owner_alias,worker_id))`);
  const heartbeatStatement=db.prepare('INSERT OR REPLACE INTO worker_heartbeats VALUES(?,?,?,?,?,?,?)');
  const heartbeat={run:(owner,id,store,capabilities,observedAt,riskClasses='read_only,draft',onlyTaskId='') =>
    heartbeatStatement.run(owner,id,store,capabilities,riskClasses,onlyTaskId,observedAt)};
  heartbeat.run('3dvr-managed','synthetic-poller','sqlite','node,codex',Date.now());
  const insert=db.prepare('INSERT INTO tasks VALUES(?,?,?,?,?,?)');
  const historical={id:'old-task',task:'historical do not replay',unsafe:true};
  insert.run('3dvr-managed',historical.id,'queued','old',JSON.stringify(historical),'sqlite');
  const script=REMOTE_QUEUE_SCRIPT.replace(/if \[ -f .*?fi\n/,'').replace('cd "$HOME/.3dvr/portal/apps/agent"',`cd '${dir}'`).replace('/opt/node-v22/bin/node',process.execPath);
  const record={id:'operator-http-test-task-123',task:'synthetic only',status:'queued',updatedAt:new Date().toISOString(),runtimeWorkItemJson:JSON.stringify({title:'Original title'})};
  const invoke=(input, queueDb=dbPath, workerCapabilities='codex,node') => spawnSync('bash',['-s','--',Buffer.from(JSON.stringify(input)).toString('base64url')],{input:script,encoding:'utf8',env:{...process.env,THREEDVR_AGENT_QUEUE_STORE:'sqlite',THREEDVR_AGENT_OWNER_ALIAS:'3dvr-managed',THREEDVR_AGENT_WORKER_CAPABILITIES:workerCapabilities,THREEDVR_AGENT_QUEUE_DB:queueDb}});
  try {
    const input={action:'enqueue',id:record.id,prefix:'operator-http-test-',record};
    assert.equal(invoke(input).status,0);
    db.prepare('UPDATE tasks SET status=? WHERE id=?').run('running',record.id);
    const retry=invoke(input);
    assert.equal(retry.status,0,retry.stderr);
    assert.equal(JSON.parse(retry.stdout).record.status,'running');
    assert.equal(db.prepare('SELECT count(*) n FROM tasks').get().n,2);
    assert.equal(db.prepare('SELECT record_json FROM tasks WHERE id=?').get('old-task').record_json,JSON.stringify(historical));
    assert.notEqual(invoke({...input,record:{...record,task:'conflicting'}}).status,0);
    // A changed title with the same task text and signed request ID is not an
    // idempotent retry. It must not ACK an unrelated prior task's result.
    const changedTitle={...input,record:{...record,runtimeWorkItemJson:JSON.stringify({title:'Different title'})}};
    assert.notEqual(invoke(changedTitle).status,0,'changed title must not ACK prior signed task');
    assert.equal(db.prepare('SELECT record_json FROM tasks WHERE id=?').get(record.id).record_json,JSON.stringify(record));
    // A public/legacy import can share a signed task namespace or task text.
    // Neither enqueue nor status may acknowledge it as an authenticated task.
    const collision={...record,id:'operator-http-test-legacy-collision'};
    insert.run('3dvr-managed',collision.id,'queued','old',JSON.stringify(collision),'gun');
    const collisionInput={...input,id:collision.id,record:collision};
    assert.notEqual(invoke(collisionInput).status,0,'legacy row must not ACK signed enqueue');
    assert.notEqual(invoke({action:'status',id:collision.id,prefix:input.prefix}).status,0,'legacy row must not impersonate a signed receipt');
    assert.equal(db.prepare('SELECT source FROM tasks WHERE id=?').get(collision.id).source,'gun');
    const fullText = 'complete output '.repeat(500);
    db.prepare('UPDATE tasks SET status=?,record_json=? WHERE id=?').run('completed', JSON.stringify({
      ...record, completedAt: '2026-10-27T11:30:00.000Z', resultSummary: fullText.slice(0,2000), resultText: fullText,
      resultSummaryTruncated: true, resultTruncated: false
    }), record.id);
    const saved = JSON.parse(invoke({action:'status',id:record.id,prefix:input.prefix}).stdout).record;
    assert.equal(saved.resultText, fullText);
    assert.equal(saved.completedAt, '2026-10-27T11:30:00.000Z', 'signed status must preserve durable worker completion time');
    assert.equal(saved.resultSummaryTruncated, true);
    assert.equal(saved.resultTruncated, false);
    // A stopped/reconfigured Codex worker must not hide durable signed receipts.
    // The same capability loss must still prevent accepting any new work.
    const offlineStatus=invoke({action:'status',id:record.id,prefix:input.prefix},dbPath,'');
    assert.equal(offlineStatus.status,0,offlineStatus.stderr);
    assert.equal(JSON.parse(offlineStatus.stdout).record.status,'completed');
    const offlineEnqueue=invoke({action:'enqueue',id:'operator-http-test-new-offline',prefix:input.prefix,
      record:{...record,id:'operator-http-test-new-offline'}},dbPath,'');
    assert.notEqual(offlineEnqueue.status,0,'offline worker must not accept a new task');
    // New signed admissions need a recent heartbeat from a poller attached to
    // the same private queue and owner, not merely an environment variable.
    const admission=(suffix) => invoke({action:'enqueue',id:'operator-http-test-'+suffix,
      prefix:input.prefix,record:{...record,id:'operator-http-test-'+suffix}});
    db.prepare('DELETE FROM worker_heartbeats').run();
    assert.notEqual(admission('missing-poller').status,0,'configured but absent poller must fail closed');
    heartbeat.run('different-owner','synthetic-poller','sqlite','codex',Date.now());
    assert.notEqual(admission('wrong-owner').status,0,'wrong queue owner is not live evidence');
    db.prepare('DELETE FROM worker_heartbeats').run();
    heartbeat.run('3dvr-managed','synthetic-poller','gun','codex',Date.now());
    assert.notEqual(admission('wrong-store').status,0,'GUN heartbeat cannot authorize SQLite');
    heartbeat.run('3dvr-managed','synthetic-poller','sqlite','codex',Date.now()-120000);
    assert.notEqual(admission('stale-poller').status,0,'stale poller must fail closed');
    heartbeat.run('3dvr-managed','synthetic-poller','sqlite','codex',Date.now()+120000);
    assert.notEqual(admission('future-poller').status,0,'future timestamp cannot bypass freshness');
    heartbeat.run('3dvr-managed','synthetic-poller','sqlite','node',Date.now());
    assert.notEqual(admission('wrong-capability').status,0,'live non-Codex worker cannot admit Codex');
    heartbeat.run('3dvr-managed','synthetic-poller','sqlite','node,codex',Date.now(),'read_only');
    assert.notEqual(admission('wrong-risk').status,0,'live read-only worker cannot accept a draft Codex task');
    heartbeat.run('3dvr-managed','synthetic-poller','sqlite','node,codex',Date.now());
    assert.equal(admission('healthy-poller').status,0,'fresh matching worker can admit a new task');
    assert.equal(db.prepare("SELECT count(*) AS n FROM tasks WHERE id LIKE 'operator-http-test-%' AND status='queued' AND source='operator-http'").get().n,1,
      'only the healthy new admission is queued; failed checks never insert');
    heartbeat.run('3dvr-managed','synthetic-poller','sqlite','codex',Date.now(),'read_only,draft',
      'operator-http-test-only-canary');
    assert.notEqual(admission('not-canary').status,0,
      'a live task-scoped worker must not authorize unrelated signed admissions');
    assert.equal(admission('only-canary').status,0,
      'the exact preselected signed canary may be admitted');
    // Exercise the real private poller's heartbeat writer against the actual
    // signed admission transport, not only independently fabricated rows.
    db.prepare('DELETE FROM worker_heartbeats').run();
    const privatePin = 'operator-http-test-real-private';
    const privatePoller = { workerProfile: () => ({
      workerId: 'synthetic-private-process',
      capabilities: ['codex'],
      riskClasses: ['draft'],
      onlyTaskId: privatePin,
    }) };
    assert.equal(publishPrivateWorkerHeartbeat(privatePoller, sqliteStore, privatePin,
      { queueDb: dbPath, ownerAlias: '3dvr-managed' }), true);
    assert.notEqual(admission('unrelated-private').status,0,
      'real pinned private heartbeat cannot admit unrelated signed work');
    assert.equal(admission('real-private').status,0,
      'real pinned private heartbeat admits only its exact signed task');
    // A signed status poll must remain readable while a separate worker holds
    // the SQLite RESERVED writer lock. The old BEGIN IMMEDIATE on status
    // waited for busy_timeout and failed instead of returning the receipt.
    db.exec('BEGIN IMMEDIATE');
    try {
      const concurrentStatus=invoke({action:'status',id:record.id,prefix:input.prefix});
      assert.equal(concurrentStatus.status,0,concurrentStatus.stderr);
      assert.equal(JSON.parse(concurrentStatus.stdout).record.status,'completed');
    } finally { db.exec('ROLLBACK'); }
    assert.match(operatorTaskReceipt(saved), /complete output/);
    assert.ok(operatorTaskReceipt(saved).endsWith(fullText.trim()));
    const missing=invoke({action:'status',id:'missing',prefix:input.prefix});
    assert.equal(JSON.parse(missing.stdout).missing,true);
    // Status must never create an empty SQLite file when a worker's queue
    // path is wrong or unavailable. Enqueue remains the only write path.
    const absentDb=join(dir,'nonexistent-queue.sqlite');
    const unavailable=invoke({action:'status',id:record.id,prefix:input.prefix},absentDb);
    assert.notEqual(unavailable.status,0,'read-only status must fail for a missing queue DB');
    await assert.rejects(stat(absentDb), {code:'ENOENT'});
  } finally {db.close();await rm(dir,{recursive:true,force:true});}
});

test('browser recovers a lost enqueue response by looking up the same signed task', async () => {
  const previous = Object.fromEntries(['Gun','localStorage','location','fetch'].map(key => [key,globalThis[key]]));
  const user={is:{pub:pair.pub,alias:'tmsteph@3dvr'},_:{sea:pair},recall(){}};
  const Gun=() => ({user:() => user});
  Gun.SEA=SEA;
  globalThis.Gun=Gun;
  globalThis.localStorage={getItem:key=>({signedIn:'true',alias:'tmsteph@3dvr',userPubKey:pair.pub}[key] || null)};
  globalThis.location={origin};
  const inputs=[];
  const handler=createOperatorDispatchHandler({config,run:async input=>{
    inputs.push(input);
    return {ok:true,record:{id:input.id,status:input.action === 'enqueue' ? 'queued' : 'completed',resultSummary:'42'}};
  }});
  globalThis.fetch=async (url,options)=>{
    assert.equal(url,'/api/operator-task');
    const body=JSON.parse(options.body);
    const res={setHeader(){},end(raw){this.data=JSON.parse(raw);}};
    await handler({method:'POST',headers:{origin},body},res);
    if(body.action === 'enqueue') throw Error('response lost after durable write');
    return {ok:res.statusCode<300,status:res.statusCode,json:async()=>res.data};
  };
  try {
    const persistedRequestId='task-persisted-research-12345';
    const task=await queueOperatorTask({text:enqueue.text,title:enqueue.title,requestId:persistedRequestId});
    assert.equal(task.taskId,`operator-http:${persistedRequestId}`);
    assert.equal(task.confirmed,false);
    const done=await new Promise(resolve=>watchOperatorTask(task.taskId,{onUpdate:resolve}));
    assert.equal(done.status,'completed');
    assert.equal(done.resultSummary,'42');
    assert.deepEqual(inputs.map(input=>input.action),['enqueue','status']);
    assert.equal(inputs[0].id,inputs[1].id);
  } finally {for(const [key,value] of Object.entries(previous)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}}
});

test('browser never reports another signed task receipt as completed', async () => {
  const previous = Object.fromEntries(['Gun','localStorage','location','fetch'].map(key => [key,globalThis[key]]));
  const user={is:{pub:pair.pub,alias:'tmsteph@3dvr'},_:{sea:pair},recall(){}};
  const Gun=() => ({user:() => user});
  Gun.SEA=SEA;
  globalThis.Gun=Gun;
  globalThis.localStorage={getItem:key=>({signedIn:'true',alias:'tmsteph@3dvr',userPubKey:pair.pub}[key] || null)};
  globalThis.location={origin};
  const requestId='task-signed-browser-identity-12345';
  const validId=`operator-http-${'a'.repeat(24)}-${requestId}`;
  const cases=[
    {requestId:'different-request-12345',record:{id:validId,status:'completed',resultSummary:'42'}},
    {requestId,record:{id:`operator-http-${'a'.repeat(24)}-different-request-12345`,status:'completed',resultSummary:'42'}},
    {requestId,record:{id:'legacy-gun-task-12345',status:'completed',resultSummary:'42'}},
    {requestId,record:{status:'completed',resultSummary:'42'}},
  ];
  try {
    for (const payload of cases) {
      let calls=0;
      globalThis.fetch=async (_url,options)=>{
        const body=JSON.parse(options.body);
        assert.equal(body.action,'status');
        assert.equal(body.requestId,requestId);
        calls++;
        return {ok:true,status:200,json:async()=>({ok:true,...payload})};
      };
      const result=await new Promise(resolve=>watchOperatorTask(`operator-http:${requestId}`,{onUpdate:resolve}));
      assert.equal(result.status,'status_unavailable');
      assert.match(result.error,/mismatched task identity/);
      assert.equal(calls,1,'a mismatched receipt must not be polled as a valid task');
    }
  } finally {
    for(const [key,value] of Object.entries(previous)) {
      if(value===undefined)delete globalThis[key];else globalThis[key]=value;
    }
  }
});

test('browser tolerates a transient 404 after uncertain signed admission without enqueuing again', async () => {
  const previous = Object.fromEntries(['Gun','localStorage','location','fetch'].map(key => [key,globalThis[key]]));
  const user={is:{pub:pair.pub,alias:'tmsteph@3dvr'},_:{sea:pair},recall(){}};
  const Gun=() => ({user:() => user});
  Gun.SEA=SEA;
  globalThis.Gun=Gun;
  globalThis.localStorage={getItem:key=>({signedIn:'true',alias:'tmsteph@3dvr',userPubKey:pair.pub}[key] || null)};
  globalThis.location={origin};
  const requestId='task-transient-missing-12345';
  const actions=[];
  try {
    globalThis.fetch=async (_url,options)=>{
      const body=JSON.parse(options.body);
      actions.push(body.action);
      assert.equal(body.action,'status','a missing receipt must never cause a second enqueue');
      assert.equal(body.requestId,requestId);
      if (actions.length === 1) return {ok:false,status:404,json:async()=>({ok:false,error:'Task not found.'})};
      return {ok:true,status:200,json:async()=>({ok:true,requestId,record:{
        id:`operator-http-${'a'.repeat(24)}-${requestId}`,status:'completed',resultSummary:'42'
      }})};
    };
    const done=await new Promise(resolve=>watchOperatorTask(`operator-http:${requestId}`,{
      timeoutMs:6000,onUpdate:record=>{if(isOperatorTaskTerminal(record))resolve(record);}
    }));
    assert.equal(done.status,'completed');
    assert.equal(done.resultSummary,'42');
    assert.deepEqual(actions,['status','status']);
  } finally {
    for(const [key,value] of Object.entries(previous)) {
      if(value===undefined)delete globalThis[key];else globalThis[key]=value;
    }
  }
});

test('task receipts prefer complete output and explicitly label the storage bound', () => {
  const text = 'a'.repeat(6000) + 'TAIL';
  const receipt = operatorTaskReceipt({status:'completed',resultText:text,resultSummary:text.slice(0,2000),resultSummaryTruncated:true});
  assert.ok(receipt.endsWith('TAIL'));
  assert.ok(receipt.includes(text));
  assert.match(operatorTaskReceipt({status:'completed',resultText:'partial',resultTruncated:true}), /storage limit/);
  assert.match(operatorTaskReceipt({status:'completed',resultSummary:'legacy result'}), /legacy result/);
});

test('browser status polling errors and timeouts never claim a server worker is blocked', async () => {
  const previous = Object.fromEntries(['Gun','localStorage','location','fetch'].map(key => [key,globalThis[key]]));
  const user={is:{pub:pair.pub,alias:'tmsteph@3dvr'},_:{sea:pair},recall(){}};
  const Gun=() => ({user:() => user});
  Gun.SEA=SEA;
  globalThis.Gun=Gun;
  globalThis.localStorage={getItem:key=>({signedIn:'true',alias:'tmsteph@3dvr',userPubKey:pair.pub}[key] || null)};
  globalThis.location={origin};
  const actions=[];
  try {
    globalThis.fetch=async (_url,options)=>{
      const body=JSON.parse(options.body);
      actions.push(body.action);
      return {ok:false,status:401,json:async()=>({ok:false,error:'Session expired'})};
    };
    const denied=await new Promise(resolve=>watchOperatorTask('operator-http:task-poll-error-12345',{onUpdate:resolve}));
    assert.equal(denied.status,'status_unavailable');
    assert.equal(isOperatorTaskTerminal(denied),true);
    assert.match(operatorTaskProgress(denied),/Status unavailable/);
    assert.match(operatorTaskReceipt(denied),/may still be queued, running, or complete/);
    assert.doesNotMatch(operatorTaskReceipt(denied),/is blocked/);

    globalThis.fetch=async (_url,options)=>{
      const body=JSON.parse(options.body);
      actions.push(body.action);
      return {ok:true,status:200,json:async()=>({ok:true,record:{status:'queued'}})};
    };
    const timedOut=await new Promise(resolve=>watchOperatorTask('operator-http:task-poll-timeout-12345',{timeoutMs:0,onUpdate:record=>{if(isOperatorTaskTerminal(record))resolve(record);}}));
    assert.equal(timedOut.status,'status_unavailable');
    assert.match(operatorTaskReceipt(timedOut),/Do not resubmit/);
    assert.deepEqual(actions,['status','status']);
  } finally {
    for(const [key,value] of Object.entries(previous)) {
      if(value===undefined)delete globalThis[key];else globalThis[key]=value;
    }
  }
});


test('browser fails fast on non-retryable signed-task protocol responses', async () => {
  const previous = Object.fromEntries(['Gun','localStorage','location','fetch'].map(key => [key,globalThis[key]]));
  const user={is:{pub:pair.pub,alias:'tmsteph@3dvr'},_:{sea:pair},recall(){}};
  const Gun=() => ({user:() => user});
  Gun.SEA=SEA;
  globalThis.Gun=Gun;
  globalThis.localStorage={getItem:key=>({signedIn:'true',alias:'tmsteph@3dvr',userPubKey:pair.pub}[key] || null)};
  globalThis.location={origin};
  try {
    for (const status of [400,405,422]) {
      let calls=0;
      globalThis.fetch=async (_url,options)=>{
        calls++;
        assert.equal(JSON.parse(options.body).action,'status');
        return {ok:false,status,json:async()=>({ok:false,error:'Invalid signed-task request'})};
      };
      const result=await new Promise(resolve=>watchOperatorTask('operator-http:task-invalid-status-12345',{onUpdate:resolve}));
      assert.equal(result.status,'status_unavailable');
      assert.match(result.error,/Invalid signed-task request/);
      assert.equal(calls,1,'permanent protocol errors must not retry or re-enqueue');
    }
    for (const status of [405,422]) {
      let calls=0;
      globalThis.fetch=async (_url,options)=>{
        calls++;
        assert.equal(JSON.parse(options.body).action,'enqueue');
        return {ok:false,status,json:async()=>({ok:false,error:'Invalid signed-task request'})};
      };
      await assert.rejects(queueOperatorTask({text:'Synthetic test only',title:'Test',requestId:'task-invalid-enqueue-12345'}),/Invalid signed-task request/);
      assert.equal(calls,1,'permanent enqueue rejection must not appear as uncertain delivery');
    }
  } finally {
    for (const [key,value] of Object.entries(previous)) {
      if(value===undefined) delete globalThis[key]; else globalThis[key]=value;
    }
  }
});

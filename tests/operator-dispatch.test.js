import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import SEA from 'gun/sea.js';
import { createOperatorDispatchHandler, REMOTE_QUEUE_SCRIPT } from '../src/operator-runtime/dispatch.js';
import { createForkRecord, revokeFork } from '../src/agents/fork-contract.js';
import { queueOperatorTask, watchOperatorTask, operatorTaskReceipt } from '../operator/delegate-task.js';

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

test('real signed requests enqueue only bounded Codex tasks and isolate status by signer', async () => {
  const inputs = [];
  const handler = createOperatorDispatchHandler({config,run:async input => {inputs.push(input);return {ok:true,record:{id:input.id,status:'queued'}};}});
  assert.equal((await request(handler,enqueue)).statusCode,202);
  assert.equal(inputs[0].record.backend,'codex');
  assert.equal(inputs[0].record.requiredCapabilities,'codex');
  assert.equal(inputs[0].record.unsafe,false);
  assert.match(inputs[0].record.operatorRequestDigest, /^[a-f0-9]{64}$/,
    'signed task must carry a stable exact-request digest');
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
  const insert=db.prepare('INSERT INTO tasks VALUES(?,?,?,?,?,?)');
  const historical={id:'old-task',task:'historical do not replay',unsafe:true};
  insert.run('3dvr-managed',historical.id,'queued','old',JSON.stringify(historical),'sqlite');
  const script=REMOTE_QUEUE_SCRIPT.replace(/if \[ -f .*?fi\n/,'').replace('cd "$HOME/.3dvr/portal/apps/agent"',`cd '${dir}'`).replace('/opt/node-v22/bin/node',process.execPath);
  const record={id:'operator-http-test-task-123',task:'synthetic only',status:'queued',updatedAt:new Date().toISOString(),runtimeWorkItemJson:JSON.stringify({title:'Original title'})};
  const invoke=input => spawnSync('bash',['-s','--',Buffer.from(JSON.stringify(input)).toString('base64url')],{input:script,encoding:'utf8',env:{...process.env,THREEDVR_AGENT_QUEUE_STORE:'sqlite',THREEDVR_AGENT_OWNER_ALIAS:'3dvr-managed',THREEDVR_AGENT_WORKER_CAPABILITIES:'codex,node',THREEDVR_AGENT_QUEUE_DB:dbPath}});
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
    // Same text + request ID with changed signed title must fail closed,
    // even after the worker claims the original task. No second row is made.
    const titleConflict=invoke({...input,record:{
      ...record,runtimeWorkItemJson:JSON.stringify({title:'Changed title'})
    }});
    assert.notEqual(titleConflict.status,0);
    assert.match(titleConflict.stderr,/Task identity conflict/);
    assert.equal(db.prepare('SELECT count(*) n FROM tasks').get().n,2);
    // A distinct signed request can normalize to the same task/title. It must
    // not inherit the first request ID or its work/result just because of trim.
    const digestRecord = {...record,id:'operator-http-test-digest-456',operatorRequestDigest:'a'.repeat(64)};
    const digestInput = {...input,id:digestRecord.id,record:digestRecord};
    assert.equal(invoke(digestInput).status,0);
    assert.equal(invoke(digestInput).status,0,'identical signed command retries are idempotent');
    const digestConflict = invoke({...digestInput,record:{...digestRecord,operatorRequestDigest:'b'.repeat(64)}});
    assert.notEqual(digestConflict.status,0,'same task and title but different signed command must be rejected');
    assert.match(digestConflict.stderr,/Task identity conflict/);
    assert.equal(db.prepare('SELECT count(*) n FROM tasks WHERE id=?').get(digestRecord.id).n,1);
    const fullText = 'complete output '.repeat(500);
    db.prepare('UPDATE tasks SET status=?,record_json=? WHERE id=?').run('completed', JSON.stringify({
      ...record, resultSummary: fullText.slice(0,2000), resultText: fullText,
      resultSummaryTruncated: true, resultTruncated: false
    }), record.id);
    const saved = JSON.parse(invoke({action:'status',id:record.id,prefix:input.prefix}).stdout).record;
    assert.equal(saved.resultText, fullText);
    assert.equal(saved.resultSummaryTruncated, true);
    assert.equal(saved.resultTruncated, false);
    assert.match(operatorTaskReceipt(saved), /complete output/);
    assert.ok(operatorTaskReceipt(saved).endsWith(fullText.trim()));
    const missing=invoke({action:'status',id:'missing',prefix:input.prefix});
    assert.equal(JSON.parse(missing.stdout).missing,true);
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
    const task=await queueOperatorTask({text:enqueue.text,title:enqueue.title});
    assert.equal(task.confirmed,false);
    const done=await new Promise(resolve=>watchOperatorTask(task.taskId,{onUpdate:resolve}));
    assert.equal(done.status,'completed');
    assert.equal(done.resultSummary,'42');
    assert.deepEqual(inputs.map(input=>input.action),['enqueue','status']);
    assert.equal(inputs[0].id,inputs[1].id);
  } finally {for(const [key,value] of Object.entries(previous)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}}
});

test('task receipts prefer complete output and explicitly label the storage bound', () => {
  const text = 'a'.repeat(6000) + 'TAIL';
  const receipt = operatorTaskReceipt({status:'completed',resultText:text,resultSummary:text.slice(0,2000),resultSummaryTruncated:true});
  assert.ok(receipt.endsWith('TAIL'));
  assert.ok(receipt.includes(text));
  assert.match(operatorTaskReceipt({status:'completed',resultText:'partial',resultTruncated:true}), /storage limit/);
  assert.match(operatorTaskReceipt({status:'completed',resultSummary:'legacy result'}), /legacy result/);
});

test('a bound admin identity enqueues as itself and a stranger is still refused', async () => {
  const adminPair = await SEA.pair();
  const cfg = {
    THREEDVR_OPERATOR_OWNER_BINDINGS: JSON.stringify({'tmsteph@3dvr': pair.pub}),
    THREEDVR_OPERATOR_ADMIN_BINDINGS: JSON.stringify({'claude@3dvr': adminPair.pub}),
  };
  const inputs = [];
  const handler = createOperatorDispatchHandler({config: cfg, run: async input => {inputs.push(input); return {ok:true, record:{id:input.id, status:'queued'}};}});
  // Owner flow is unchanged: the tenant stamp stays operator-owner.
  assert.equal((await request(handler, enqueue)).statusCode, 202);
  assert.equal(inputs[0].record.tenantAlias, 'operator-owner');
  // The admin enqueues under its own principal, never the owner's.
  assert.equal((await request(handler, enqueue, adminPair)).statusCode, 202);
  assert.equal(inputs[1].record.tenantAlias, 'claude@3dvr');
  assert.notEqual(inputs[1].id, inputs[0].id);
  // Status stays scoped to the signer: the admin reads back its own task id.
  assert.equal((await request(handler, {action:'status', requestId:enqueue.requestId}, adminPair)).statusCode, 200);
  assert.equal(inputs[2].id, inputs[1].id);
  // An unbound identity is still refused before anything reaches the queue.
  assert.equal((await request(handler, enqueue, await SEA.pair())).statusCode, 403);
  assert.equal(inputs.length, 3);
});

test('a forked admin keeps dispatch access only while its fork is active and grants admin', async () => {
  const adminPair = await SEA.pair();
  const forkFor = (permissions, options = {}) => createForkRecord({
    parentAlias: 'tmsteph@3dvr',
    parentPub: pair.pub,
    parentPermissions: [
      'suggest', 'edit', 'github_write', 'admin',
      'workspace.read', 'workspace.write', 'workspace.export',
      'workspace.manage_access', 'workspace.sync',
    ],
    childAlias: 'claude@3dvr',
    childPub: adminPair.pub,
    permissions,
    note: 'Dispatch fork gate test',
  }, { now: 1000, idFactory: () => 'fork_dispatch_test', ...options });
  const handlerFor = (forks) => {
    const inputs = [];
    const handler = createOperatorDispatchHandler({
      config: {
        THREEDVR_OPERATOR_OWNER_BINDINGS: JSON.stringify({'tmsteph@3dvr': pair.pub}),
        THREEDVR_OPERATOR_ADMIN_BINDINGS: JSON.stringify({'claude@3dvr': adminPair.pub}),
        THREEDVR_FORKS: JSON.stringify(forks),
      },
      run: async input => { inputs.push(input); return {ok:true, record:{id:input.id, status:'queued'}}; },
    });
    return { handler, inputs };
  };

  // Active fork granting admin: enqueue works, stamped with the fork alias.
  const active = handlerFor([forkFor(['suggest', 'admin'])]);
  assert.equal((await request(active.handler, enqueue, adminPair)).statusCode, 202);
  assert.equal(active.inputs[0].record.tenantAlias, 'claude@3dvr');
  assert.equal((await request(active.handler, {action:'status', requestId:enqueue.requestId}, adminPair)).statusCode, 200);

  // Downgraded fork (admin removed): the binding alone no longer suffices.
  const downgraded = handlerFor([forkFor(['suggest'])]);
  assert.equal((await request(downgraded.handler, enqueue, adminPair)).statusCode, 403);
  assert.equal(downgraded.inputs.length, 0);

  // Revoked fork: access ends at once, still without touching the queue.
  const revoked = handlerFor([revokeFork(forkFor(['suggest', 'admin']), 2000)]);
  assert.equal((await request(revoked.handler, enqueue, adminPair)).statusCode, 403);
  assert.equal(revoked.inputs.length, 0);

  // The owner is not a fork child and is unaffected by fork records.
  assert.equal((await request(revoked.handler, enqueue)).statusCode, 202);
});


test('signed Operator HTTP path persists one task in an isolated SQLite queue without worker or network access', async () => {
  // Local process stands in for the SSH hop, but uses the exact production
  // REMOTE_QUEUE_SCRIPT and real SEA verification. This is NOT worker/CRM E2E.
  const dir = await mkdtemp(join(tmpdir(), 'operator-signed-isolated-'));
  const dbPath = join(dir, 'queue.sqlite');
  const db = new DatabaseSync(dbPath);
  db.exec('CREATE TABLE tasks(owner_alias TEXT,id TEXT,status TEXT,updated_at TEXT,record_json TEXT,source TEXT,PRIMARY KEY(owner_alias,id))');
  const script = REMOTE_QUEUE_SCRIPT
    .replace(/if \[ -f .*?fi\n/, '')
    .replace('cd "$HOME/.3dvr/portal/apps/agent"', "cd '" + dir + "'")
    .replace('/opt/node-v22/bin/node', process.execPath);
  const seen = [];
  const handler = createOperatorDispatchHandler({
    config,
    run: async input => {
      seen.push(input);
      const proc = spawnSync('bash', ['-s', '--', Buffer.from(JSON.stringify(input)).toString('base64url')], {
        input: script,
        encoding: 'utf8',
        env: {
          ...process.env,
          THREEDVR_AGENT_QUEUE_STORE: 'sqlite',
          THREEDVR_AGENT_OWNER_ALIAS: '3dvr-managed',
          THREEDVR_AGENT_WORKER_CAPABILITIES: 'codex,node',
          THREEDVR_AGENT_QUEUE_DB: dbPath,
          THREEDVR_AGENT_QUEUE_GUN_SYNC: '0'
        }
      });
      assert.equal(proc.status, 0, proc.stderr);
      return JSON.parse(proc.stdout);
    }
  });
  const item = { ...enqueue, requestId: 'local-isolated-operator-123' };
  try {
    const denied = await request(handler, item, await SEA.pair());
    assert.equal(denied.statusCode, 403);
    assert.equal(seen.length, 0, 'wrong signer cannot enter queue transport');

    const accepted = await request(handler, item);
    assert.equal(accepted.statusCode, 202);
    assert.equal(accepted.data.record.status, 'queued');
    assert.match(accepted.data.record.id, /^operator-http-/);
    assert.equal(seen[0].record.backend, 'codex');

    const retry = await request(handler, item);
    assert.equal(retry.statusCode, 202);
    assert.equal(retry.data.record.id, accepted.data.record.id);
    assert.equal(db.prepare('SELECT count(*) n FROM tasks').get().n, 1);
    assert.equal(seen[0].record.operatorRequestDigest, seen[1].record.operatorRequestDigest,
      'same signed requestId/text/title yields identical digest across HTTP retries');
    const whitespaceChanged = await request(handler,{...item,text:item.text+'   '});
    assert.equal(whitespaceChanged.statusCode,503,'changed signed text with same normalized task must fail closed');
    assert.equal(seen[2].record.task,seen[0].record.task,'normalization makes actual task text identical');
    assert.notEqual(seen[2].record.operatorRequestDigest,seen[0].record.operatorRequestDigest,
      'exact signed content, not normalized task text, decides replay identity');
    assert.equal(db.prepare('SELECT count(*) n FROM tasks').get().n,1,'conflicting retry adds no row');

    // A second SQLite connection independently verifies durable identity and
    // provenance. No worker runs, no CRM write occurs, no outbound is enabled.
    const readback = new DatabaseSync(dbPath);
    try {
      const row = readback.prepare('SELECT * FROM tasks WHERE owner_alias=? AND id=?')
        .get('3dvr-managed', accepted.data.record.id);
      assert.equal(row.source, 'operator-http');
      assert.equal(row.status, 'queued');
      const saved = JSON.parse(row.record_json);
      assert.equal(saved.task, seen[0].record.task);
      assert.equal(saved.unsafe, false);
      assert.equal(saved.approvalStatus, 'not_required');
    } finally { readback.close(); }

    const status = await request(handler, { action: 'status', requestId: item.requestId });
    assert.equal(status.statusCode, 200);
    assert.equal(status.data.record.id, accepted.data.record.id);
    assert.equal(status.data.record.status, 'queued', 'no worker completion is simulated or claimed');

    // Model a separately committed worker result without launching a worker:
    // the owner-signed status reader must expose attribution and a retry must
    // never reset an already-finished task to queued or create a second task.
    const syntheticWorkerId = 'synthetic-worker-fixture-not-a-live-worker';
    const savedRow = db.prepare('SELECT record_json FROM tasks WHERE owner_alias=? AND id=?')
      .get('3dvr-managed', accepted.data.record.id);
    const syntheticResult = {
      ...JSON.parse(savedRow.record_json),
      status: 'completed',
      workerDeviceId: syntheticWorkerId,
      resultSummary: '42',
      resultText: '42',
      updatedAt: '2026-11-17T23:00:00.000Z'
    };
    db.prepare('UPDATE tasks SET status=?, updated_at=?, record_json=? WHERE owner_alias=? AND id=?')
      .run('completed', syntheticResult.updatedAt, JSON.stringify(syntheticResult),
        '3dvr-managed', accepted.data.record.id);

    const completed = await request(handler, { action: 'status', requestId: item.requestId });
    assert.equal(completed.statusCode, 200);
    assert.equal(completed.data.record.status, 'completed');
    assert.equal(completed.data.record.workerDeviceId, syntheticWorkerId);
    assert.equal(completed.data.record.resultText, '42');

    const completedRetry = await request(handler, item);
    assert.equal(completedRetry.statusCode, 202);
    assert.equal(completedRetry.data.record.status, 'completed');
    assert.equal(completedRetry.data.record.workerDeviceId, syntheticWorkerId);
    assert.equal(db.prepare('SELECT count(*) n FROM tasks').get().n, 1);
    const independentCompletedReadback = new DatabaseSync(dbPath);
    try {
      const row = independentCompletedReadback.prepare('SELECT status,record_json FROM tasks WHERE owner_alias=? AND id=?')
        .get('3dvr-managed', accepted.data.record.id);
      assert.equal(row.status, 'completed');
      assert.equal(JSON.parse(row.record_json).workerDeviceId, syntheticWorkerId);
    } finally { independentCompletedReadback.close(); }
  } finally {
    db.close();
    await rm(dir, { recursive: true, force: true });
  }
});

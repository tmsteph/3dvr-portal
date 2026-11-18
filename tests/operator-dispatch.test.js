import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import SEA from 'gun/sea.js';
import { createOperatorDispatchHandler, REMOTE_QUEUE_SCRIPT } from '../src/operator-runtime/dispatch.js';
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
  const record={id:'operator-http-test-task-123',task:'synthetic only',status:'queued',updatedAt:new Date().toISOString()};
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
  } finally {
    db.close();
    await rm(dir, { recursive: true, force: true });
  }
});

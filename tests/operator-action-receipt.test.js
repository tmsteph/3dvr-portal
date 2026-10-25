import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  actionReceiptFromRuntimeRecord,
  createActionReceipt,
  normalizeActionReceiptStatus
} from '../src/operator-runtime/action-receipt.js';
import { persistQueuedOperatorAction, persistBackgroundActionUpdate, loadOperatorActionReceipts } from '../operator/action-receipts.js';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('completion is not treated as verification', () => {
  const receipt = createActionReceipt({
    actionId: 'task-1',
    kind: 'forge',
    status: 'completed',
    resultSummary: 'Worker says the edit completed.'
  });

  assert.equal(receipt.status, 'succeeded');
  assert.equal(receipt.verificationStatus, 'pending');
  assert.equal(receipt.verified, false);
  assert.equal(receipt.terminal, true);
});

test('explicit verification produces a verified receipt', () => {
  const receipt = actionReceiptFromRuntimeRecord({
    id: 'server-1',
    status: 'completed',
    verificationStatus: 'verified',
    resultSummary: 'Health check passed.',
    workerDeviceId: 'worker-a'
  }, {
    kind: 'server_control',
    domain: 'infrastructure'
  });

  assert.equal(receipt.status, 'succeeded');
  assert.equal(receipt.verificationStatus, 'verified');
  assert.equal(receipt.verified, true);
  assert.equal(receipt.workerId, 'worker-a');
});

test('runtime statuses collapse into the shared action vocabulary', () => {
  assert.equal(normalizeActionReceiptStatus('queued'), 'queued');
  assert.equal(normalizeActionReceiptStatus('running'), 'running');
  assert.equal(normalizeActionReceiptStatus('review'), 'waiting');
  assert.equal(normalizeActionReceiptStatus('blocked'), 'blocked');
  assert.equal(normalizeActionReceiptStatus('rejected'), 'failed');
  assert.equal(normalizeActionReceiptStatus('cancelled'), 'cancelled');
});

test('Operator execution lanes persist shared receipts', async () => {
  const actions = await read('operator/actions.js');
  const receipts = await read('operator/action-receipts.js');

  assert.match(actions, /persistQueuedOperatorAction/);
  assert.match(actions, /persistBackgroundActionUpdate/);
  assert.match(receipts, /3dvr\.operator\.actionReceipts\.v1/);
  assert.match(receipts, /\.get\('receipts'\)/);
});

test('money autopilot emits a revenue receipt without claiming business verification', async () => {
  const script = await read('scripts/money/run-autopilot.mjs');

  assert.match(script, /kind: 'revenue_cycle'/);
  assert.match(script, /domain: 'revenue'/);
  assert.match(script, /verificationStatus: 'pending'/);
  assert.match(script, /actionReceipt: receipt/);
});

test('private HTTP task updates retain one account-scoped receipt without any public Gun writes', () => {
  const previousStorage=globalThis.localStorage;
  const previousGun=globalThis.Gun;
  const values=new Map([['signedIn','true'],['userPubKey','owner-key'],['alias','owner']]);
  let publicWrites=0;
  globalThis.localStorage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
  globalThis.Gun=()=>{publicWrites++;throw Error('Public Gun must not be used');};
  const background={kind:'operator_runtime',id:'operator-http:private-request-123'};
  try {
    persistQueuedOperatorAction({title:'Private test',text:'private sentinel'}, {backgroundTask:background});
    const complete=persistBackgroundActionUpdate(background,{record:{id:'operator-http-server-identity',status:'completed',resultSummary:'private answer'}});
    const saved=loadOperatorActionReceipts();
    assert.equal(publicWrites,0);
    assert.equal(saved.length,1);
    assert.equal(saved[0].id,complete.id);
    assert.equal(saved[0].status,'succeeded');
    assert.equal(saved[0].resultSummary,'private answer');
    values.set('userPubKey','different-owner');
    assert.deepEqual(loadOperatorActionReceipts(),[]);
    assert.equal(values.has('3dvr.operator.actionReceipts.v1'),false);
  } finally {
    if(previousStorage===undefined)delete globalThis.localStorage;else globalThis.localStorage=previousStorage;
    if(previousGun===undefined)delete globalThis.Gun;else globalThis.Gun=previousGun;
  }
});

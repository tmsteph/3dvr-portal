import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildMoneyPrinterOperationContext,
  createConnectorOperationPlan
} from '../src/money-printer/moneyPrinterOperations.js';
import { buildStatePayload } from '../src/money-printer/moneyPrinterModelProvider.js';

test('compacts operation history into safe execution memory for the model', () => {
  const operations = [
    createConnectorOperationPlan({
      id: 'op-planned',
      provider: 'github',
      action: 'createIssue',
      title: 'Research AV buyers',
      summary: 'Research the same buyer segment once.',
      risk: 'green',
      status: 'planned',
      payload: { title: 'Research AV buyers', token: 'do-not-leak' }
    }),
    createConnectorOperationPlan({
      id: 'op-failed',
      provider: 'vercel',
      action: 'inspectProject',
      title: 'Inspect deployment state',
      summary: 'Check the project before changing deployment behavior.',
      risk: 'green',
      status: 'failed',
      result: { ok: false, status: 'failed', message: 'Project token expired.' }
    })
  ];

  const context = buildMoneyPrinterOperationContext(operations);

  assert.equal(context.total, 2);
  assert.equal(context.counts.planned, 1);
  assert.equal(context.counts.failed, 1);
  assert.equal(context.recent[1].outcome.message, 'Project token expired.');
  assert.doesNotMatch(JSON.stringify(context), /do-not-leak/);
});

test('includes operation queue memory in every model state payload', () => {
  const operationQueue = {
    total: 1,
    counts: { approved: 1 },
    recent: [{
      id: 'op-approved',
      provider: 'github',
      action: 'createIssue',
      title: 'Already queued task',
      status: 'approved'
    }]
  };

  const payload = buildStatePayload({ operationQueue });

  assert.deepEqual(payload.operationQueue, operationQueue);
});

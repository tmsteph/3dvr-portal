import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  isOperatorTaskTerminal,
  operatorTaskProgress,
  operatorTaskReceipt
} from '../operator/delegate-task.js';
import {
  isServerControlTerminal,
  serverControlProgress,
  serverControlReceipt
} from '../operator/server-control.js';
import {
  isForgeEditTerminal
} from '../operator/forge-status.js';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('delegated task status is concise and keeps the runtime budget honest', () => {
  assert.match(operatorTaskProgress({ status:'queued' }, 120_000), /Queued/);
  assert.match(operatorTaskProgress({ status:'queued' }, 120_000), /runtime budget ≤2m/);
  assert.match(operatorTaskProgress({ status:'running' }, 120_000), /Working/);
  assert.equal(isOperatorTaskTerminal({ status:'running' }), false);
  assert.equal(isOperatorTaskTerminal({ status:'completed' }), true);
  assert.equal(
    operatorTaskReceipt({ status:'completed', resultSummary:'Found the issue and verified the fix.' }),
    'Operator Runtime finished. Result: Found the issue and verified the fix.'
  );
});
test('server-control updates distinguish queued, running, and terminal states', () => {
  assert.match(serverControlProgress({ status:'queued' }), /queued/);
  assert.match(serverControlProgress({ status:'running' }), /running/);
  assert.equal(isServerControlTerminal({ status:'running' }), false);
  assert.equal(isServerControlTerminal({ status:'completed' }), true);
  assert.equal(
    serverControlReceipt({ status:'failed', error:'worker unavailable' }),
    'Server request failed: worker unavailable'
  );
});

test('Forge terminal-state helper matches completion and approval stops', () => {
  assert.equal(isForgeEditTerminal({ status:'running' }), false);
  assert.equal(isForgeEditTerminal({ status:'completed' }), true);
  assert.equal(isForgeEditTerminal({ status:'approval_required' }), true);
});

test('both Operator surfaces keep delegated progress in the conversation', async () => {
  const home = await read('home-operator.js');
  const full = await read('operator/app.js');
  const actions = await read('operator/actions.js');
  const delegated = await read('operator/delegate-task.js');

  assert.match(delegated, /\.get\('tasks'\)\s*\.get\(id\)/);
  assert.match(home, /watchOperatorActionOutcome/);
  assert.match(home, /assistantEntry\.content = liveMessage/);
  assert.match(full, /watchOperatorActionOutcome/);
  assert.match(full, /streamingMessage\.content=\[data\.reply,update\.message\]/);
  assert.match(actions, /backgroundTask: \{ kind:'operator_runtime'/);
  assert.match(actions, /backgroundTask: \{ kind:'server_control'/);
  assert.match(actions, /backgroundTask: \{ kind:'forge'/);
});
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
  assert.match(operatorTaskProgress({ status:'completed' }), /receipt unverified/);
  assert.match(operatorTaskProgress({
    status:'completed', resultSummary:'42', workerDeviceId:'worker-1',
    startedAt:'2026-10-28T10:00:00Z', completedAt:'2026-10-28T10:00:05Z'
  }), /worker receipt present/);
  assert.equal(
    operatorTaskReceipt({
      status:'completed', resultSummary:'Found the issue and verified the fix.',
      workerDeviceId:'worker-1', startedAt:'2026-10-28T10:00:00Z', completedAt:'2026-10-28T10:00:05Z'
    }),
    'Operator Runtime finished. Result: Found the issue and verified the fix.'
  );
});
test('completed queue status without attributable worker evidence is reported as unverified', () => {
  const result = 'Research complete.';
  assert.match(
    operatorTaskReceipt({ status:'completed', resultSummary:result }),
    /worker receipt is incomplete.*Reported result: Research complete/
  );
  assert.match(
    operatorTaskReceipt({ status:'completed' }),
    /Verify execution before relying on it/
  );
  assert.match(
    operatorTaskReceipt({
      status:'completed', resultSummary:result, workerDeviceId:'worker-1',
      startedAt:'2026-10-28T10:00:05Z', completedAt:'2026-10-28T10:00:00Z'
    }),
    /worker receipt is incomplete/
  );
  assert.match(
    operatorTaskReceipt({
      status:'completed', resultSummary:result,
      startedAt:'2026-10-28T10:00:00Z', completedAt:'2026-10-28T10:00:05Z'
    }),
    /worker receipt is incomplete/
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

test('self-hosted Operator does not load Vercel-only analytics as an executable asset', async () => {
  const html = await read('operator/index.html');
  // OVH has no /_vercel/insights/script.js; a 404 text/plain response
  // produces a noisy MIME/script failure during authenticated acceptance.
  assert.doesNotMatch(html, /<script[^>]+src=["']\/_vercel\/insights\/script\.js["']/i);
  // Removing optional analytics must not remove the essential app or auth.
  assert.match(html, /<script[^>]+src=["']\/gun-init\.js["']/i);
  assert.match(html, /<script[^>]+src=["']\/auth-identity\.js["']/i);
  assert.match(html, /<script[^>]+type=["']module["'][^>]+src=["']app\.js["']/i);
});

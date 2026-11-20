import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { laneFor, friendlyStatus } from '../src/operator-runtime/workboard-status.js';

const label = (status, kind = 'agent-task') => {
  const item = { kind, record: { status } };
  return { lane: laneFor(status, kind), label: friendlyStatus(item, laneFor(status, kind)) };
};

test('cancellation and closed GitHub work cannot be presented as completed execution', () => {
  for (const status of ['cancelled', 'canceled']) {
    assert.deepEqual(label(status), { lane: 'done', label: 'cancelled' });
  }
  assert.deepEqual(label('closed', 'github-issue'), { lane: 'done', label: 'closed' });
  assert.deepEqual(label('closed', 'github-pr'), { lane: 'done', label: 'closed' });
});

test('verified success and active, blocked, and waiting states remain distinguishable', () => {
  assert.deepEqual(label('completed'), { lane: 'done', label: 'done' });
  assert.deepEqual(label('merged', 'github-pr'), { lane: 'done', label: 'merged' });
  assert.deepEqual(label('failed'), { lane: 'review', label: 'failed' });
  assert.deepEqual(label('blocked'), { lane: 'review', label: 'blocked' });
  assert.deepEqual(label('waiting_human'), { lane: 'review', label: 'needs you' });
  assert.deepEqual(label('running'), { lane: 'working', label: 'working' });
  assert.deepEqual(label('queued'), { lane: 'inbox', label: 'queued' });
});

test('Workboard uses the tested pure status functions, not a divergent local labeler', async () => {
  const source = await readFile(new URL('../workboard/app.js', import.meta.url), 'utf8');
  assert.match(source, /import \{ laneFor, friendlyStatus \} from '..\\/src\\/operator-runtime\\/workboard-status\\.js'/);
  assert.doesNotMatch(source, /function friendlyStatus\(/);
});

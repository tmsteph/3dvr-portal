import test from 'node:test';
import assert from 'node:assert/strict';
import { backgroundTaskForMessage, createOperatorTaskTracker } from '../operator/background-tracking.js';
const flush = () => new Promise(resolve => setImmediate(resolve));
const message = () => ({ id: 'reply', role: 'assistant', content: 'The code change is queued.',
  actionUrl: '/forge/record.html?kind=edit&id=operator-task-123&returnTo=operator' });

test('old saved Forge chat links restore status tracking without submitting work', () => {
  assert.deepEqual(backgroundTaskForMessage(message()), { kind: 'forge', value: message().actionUrl });
  assert.equal(backgroundTaskForMessage({ ...message(), actionUrl: 'https://evil.example/forge/record.html?kind=edit&id=operator-task-123' }), null);
  assert.equal(backgroundTaskForMessage({ ...message(), actionUrl: '/forge/record.html?kind=suggestion&id=operator-task-123' }), null);
});

test('restored tracking replaces stale queued text with a saved completion and does not duplicate subscriptions', async () => {
  const node = message();
  const conversations = [{ id: 'chat', messages: [node] }];
  let calls = 0, handlers, stops = 0, updates = 0;
  const tracker = createOperatorTaskTracker({
    watch: (outcome, next) => { calls++; handlers = next; assert.equal(outcome.backgroundTask.kind, 'forge'); return () => { stops++; }; },
    onChange: () => { updates++; }
  });
  tracker.refresh(conversations); tracker.refresh(conversations);
  await flush(); assert.equal(calls, 1);
  handlers.onUpdate({ status: 'running', terminal: false, message: 'Forge is editing/testing.' });
  handlers.onUpdate({ status: 'completed', terminal: true, message: 'Forge reports the task completed. Verified change.' });
  await flush();
  assert.match(node.content, /Verified change/);
  assert.doesNotMatch(node.content, /editing\/testing/);
  assert.equal(node.backgroundTerminal, true);
  tracker.refresh(conversations);
  assert.equal(calls, 1); assert.equal(stops, 1); assert.equal(updates, 2);
});

test('history synchronization detaches obsolete message references and ignores their late updates', async () => {
  const old = message(), replacement = message();
  const handlers = [], stops = [];
  const tracker = createOperatorTaskTracker({
    watch: (_outcome, next) => { const index = handlers.push(next) - 1; return () => stops.push(index); }
  });
  tracker.refresh([{ id: 'chat', messages: [old] }]); await flush();
  tracker.refresh([{ id: 'chat', messages: [replacement] }]); await flush();
  handlers[0].onUpdate({ status: 'completed', terminal: true, message: 'Obsolete result' });
  assert.equal(replacement.content, 'The code change is queued.');
  handlers[1].onUpdate({ status: 'completed', terminal: true, message: 'Current result' });
  assert.match(replacement.content, /Current result/);
  assert.ok(stops.includes(0));
});

test('private runtime descriptors resume by their original identity without new enqueue requests', async () => {
  const node = { id: 'private', role: 'assistant', content: 'Saved task',
    backgroundTask: { kind: 'operator_runtime', id: 'operator-http:task-original' } };
  let background;
  const tracker = createOperatorTaskTracker({ watch: outcome => { background = outcome.backgroundTask; return () => {}; } });
  tracker.refresh([{ id: 'chat', messages: [node] }]); await flush();
  assert.deepEqual(background, node.backgroundTask);
  tracker.stop();
});

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  TASK_CACHE_KEY,
  LEGACY_TASK_CACHE_KEYS,
  TASK_QUEUE_KEY,
  createMemoryStorage,
  sanitizeTaskRecord,
  readTaskCache,
  writeTaskCache,
  enqueueTaskOperation,
  readTaskQueue,
  flushTaskQueue,
  applyTaskOperation
} from '../tasks/tasks-core.js';

describe('tasks core helpers', () => {
  let storage;
  const now = () => 1700000000000;

  beforeEach(() => {
    storage = createMemoryStorage();
  });

  it('sanitizes task records with defaults and trimmed values', () => {
    const record = sanitizeTaskRecord({
      id: ' task-1 ',
      title: '  Demo  ',
      description: ' Example ',
      priority: 'urgent',
      status: 'unknown',
      assignee: '',
      createdAt: 'not-a-number',
      history: [
        { action: 'created', user: '', timestamp: 'bad' },
        { action: '', user: 'ignored' }
      ],
      comments: [
        { text: ' First ', author: '' },
        { text: '' }
      ]
    }, { fallbackAssignee: 'Agent', fallbackCreator: 'Agent', now });

    assert.equal(record.id, 'task-1');
    assert.equal(record.title, 'Demo');
    assert.equal(record.priority, 'medium');
    assert.equal(record.status, 'pending');
    assert.equal(record.assignee, 'Agent');
    assert.equal(record.createdBy, 'Agent');
    assert.equal(record.history.length, 1);
    assert.equal(record.comments.length, 1);
    assert.equal(record.comments[0].text, 'First');
    assert.equal(record.completed, false);
    assert.equal(record.createdAt, now());
    assert.equal(record.updatedAt, now());
  });

  it('reads and writes task cache using new and legacy keys', () => {
    const legacyKey = LEGACY_TASK_CACHE_KEYS[0];
    storage.setItem(legacyKey, JSON.stringify({
      a: { id: 'a', title: 'Legacy' },
      b: { id: 'b', title: 'Record', status: 'done' }
    }));

    const initial = readTaskCache(storage, { fallbackAssignee: 'Guest', fallbackCreator: 'Guest', now });
    assert.deepEqual(Object.keys(initial).sort(), ['a', 'b']);
    assert.equal(initial.b.status, 'done');

    writeTaskCache(storage, {
      x: { id: 'x', title: 'Primary', status: 'progress' }
    }, { fallbackAssignee: 'Agent', fallbackCreator: 'Agent', now });

    const rawPrimary = storage.getItem(TASK_CACHE_KEY);
    const parsed = JSON.parse(rawPrimary);
    assert.ok(parsed.x);
    assert.equal(parsed.x.status, 'progress');
    assert.equal(storage.getItem(legacyKey), null);
  });

  it('queues operations and deduplicates by task id', () => {
    enqueueTaskOperation(storage, { type: 'put', taskId: 'a', task: { id: 'a', title: 'One' } }, { fallbackAssignee: 'Guest', fallbackCreator: 'Guest', now });
    enqueueTaskOperation(storage, { type: 'put', taskId: 'a', task: { id: 'a', title: 'Updated' } }, { fallbackAssignee: 'Guest', fallbackCreator: 'Guest', now });
    enqueueTaskOperation(storage, { type: 'remove', taskId: 'b' }, { fallbackAssignee: 'Guest', fallbackCreator: 'Guest', now });

    const queue = readTaskQueue(storage);
    assert.equal(queue.length, 2);
    const [first, second] = queue;
    assert.equal(first.taskId, 'a');
    assert.equal(first.task.title, 'Updated');
    assert.equal(second.type, 'remove');
  });

  it('flushes queue operations and preserves failures', async () => {
    enqueueTaskOperation(storage, { type: 'put', taskId: 'a', task: { id: 'a', title: 'A' } }, { fallbackAssignee: 'Guest', fallbackCreator: 'Guest', now });
    enqueueTaskOperation(storage, { type: 'remove', taskId: 'b' }, { fallbackAssignee: 'Guest', fallbackCreator: 'Guest', now });

    let putCalls = 0;
    const flushResult = await flushTaskQueue({
      storage,
      queueKey: TASK_QUEUE_KEY,
      onPut: async (taskId, task) => {
        putCalls++;
        assert.equal(taskId, 'a');
        assert.equal(task.title, 'A');
      },
      onRemove: async () => {
        throw new Error('network-error');
      }
    });

    assert.equal(putCalls, 1);
    assert.equal(flushResult.flushed, 1);
    assert.equal(flushResult.remaining, 1);

    const remaining = readTaskQueue(storage);
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].taskId, 'b');
    assert.equal(remaining[0].type, 'remove');
  });

  it('applies task operations immutably to a map', () => {
    const base = {
      a: { id: 'a', title: 'Alpha' }
    };
    const added = applyTaskOperation(base, { type: 'put', taskId: 'b', task: { id: 'b', title: 'Beta' } }, { fallbackAssignee: 'Guest', fallbackCreator: 'Guest', now });
    assert.deepEqual(Object.keys(added).sort(), ['a', 'b']);
    assert.equal(base.b, undefined);

    const removed = applyTaskOperation(added, { type: 'remove', taskId: 'a' });
    assert.equal(removed.a, undefined);
    assert.equal(added.a.id, 'a');
  });
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createScheduleId,
  formatFileSize,
  formatRelativeTime,
  formatScheduleWindow,
  labelForStatus,
  sanitizeRecord,
  scheduleSortKey
} from '../social/scheduler-utils.js';

test('createScheduleId uses deterministic prefix', () => {
  const originalNow = Date.now;
  const originalRandom = Math.random;
  Date.now = () => 1700000000000;
  Math.random = () => 0.123456;

  const id = createScheduleId();
  assert.equal(id, 'post-1700000000000-1f9acf');

  Date.now = originalNow;
  Math.random = originalRandom;
});

test('scheduleSortKey builds a timestamp for date/time', () => {
  const record = { scheduledDate: '2024-08-01', scheduledTime: '12:30' };
  assert.equal(scheduleSortKey(record), Date.parse('2024-08-01T12:30'));
  assert.equal(scheduleSortKey({ scheduledDate: '2024-08-01' }), Date.parse('2024-08-01T00:00'));
  assert.equal(scheduleSortKey({}), Number.MAX_SAFE_INTEGER);
});

test('formatScheduleWindow builds a readable label', () => {
  assert.equal(formatScheduleWindow('', '', ''), 'Schedule: TBD');
  assert.equal(formatScheduleWindow('2024-08-01', '', ''), 'Schedule: 2024-08-01');
  assert.equal(formatScheduleWindow('2024-08-01', '12:30', 'ET'), 'Schedule: 2024-08-01 at 12:30 ET');
});

test('labelForStatus maps scheduler states', () => {
  assert.equal(labelForStatus('idea'), 'Idea');
  assert.equal(labelForStatus('drafting'), 'Drafting');
  assert.equal(labelForStatus('queued'), 'Queued');
  assert.equal(labelForStatus('published'), 'Published');
  assert.equal(labelForStatus('scheduled'), 'Scheduled');
  assert.equal(labelForStatus('unknown'), 'Scheduled');
});

test('formatRelativeTime expresses elapsed time', () => {
  const originalNow = Date.now;
  Date.now = () => 60000;
  assert.equal(formatRelativeTime(60000), 'just now');
  assert.equal(formatRelativeTime(0), '1 minute ago');
  Date.now = () => 60 * 60 * 1000;
  assert.equal(formatRelativeTime(0), '1 hour ago');
  Date.now = originalNow;
});

test('sanitizeRecord removes Gun metadata and functions', () => {
  const input = { name: 'Post', _: { '#': 'soul' }, fn() {}, nested: { ok: true, _: { '#': 'x' } } };
  assert.deepEqual(sanitizeRecord(input), { name: 'Post', nested: { ok: true } });
});

test('formatFileSize returns human-readable sizes', () => {
  assert.equal(formatFileSize(0), '0 B');
  assert.equal(formatFileSize(2048), '2.0 KB');
  assert.equal(formatFileSize(1024 * 1024), '1.0 MB');
});

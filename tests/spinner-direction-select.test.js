import test from 'node:test';
import assert from 'node:assert/strict';
import { classifySpinnerRelease, selectSpinnerDirection } from '../spinner-direction.js';

test('spinner directional selection maps the primary wheel axes to portal destinations', () => {
  assert.equal(selectSpinnerDirection(0, -60), 'day');
  assert.equal(selectSpinnerDirection(60, 0), 'work');
  assert.equal(selectSpinnerDirection(0, 60), 'games');
  assert.equal(selectSpinnerDirection(-60, 0), 'apps');
});

test('spinner directional selection reaches all six visible destinations', () => {
  assert.equal(selectSpinnerDirection(70, -38), 'work');
  assert.equal(selectSpinnerDirection(70, 38), 'build');
  assert.equal(selectSpinnerDirection(20, 74), 'games');
  assert.equal(selectSpinnerDirection(-70, 38), 'leads');
  assert.equal(selectSpinnerDirection(-70, -38), 'apps');
  assert.equal(selectSpinnerDirection(20, -74), 'day');
});

test('normal spins open the menu instead of navigating', () => {
  assert.deepEqual(
    classifySpinnerRelease({ dx: 62, dy: 0, durationMs: 260, selectionHeldMs: 80 }),
    { action: 'menu', selection: 'work', reason: 'spin', distance: 62, speed: 62 / 260 }
  );
  assert.equal(classifySpinnerRelease({ dx: 24, dy: 0, durationMs: 140 }).action, 'menu');
  assert.equal(classifySpinnerRelease({ dx: 10, dy: 0, durationMs: 120 }).action, 'none');
});

test('holding one direction deliberately arms app activation', () => {
  const result = classifySpinnerRelease({
    dx: -70,
    dy: 38,
    durationMs: 820,
    selectionHeldMs: 690
  });
  assert.equal(result.action, 'activate');
  assert.equal(result.selection, 'leads');
  assert.equal(result.reason, 'hold');

  assert.equal(classifySpinnerRelease({
    dx: 68,
    dy: 0,
    durationMs: 700,
    selectionHeldMs: 520
  }).action, 'menu');
});

test('only a very strong fast flick activates immediately', () => {
  const strong = classifySpinnerRelease({
    dx: 0,
    dy: 160,
    durationMs: 160,
    selectionHeldMs: 20
  });
  assert.equal(strong.action, 'activate');
  assert.equal(strong.reason, 'flick');
  assert.equal(strong.selection, 'games');

  assert.equal(classifySpinnerRelease({
    dx: 160,
    dy: 0,
    durationMs: 420,
    selectionHeldMs: 20
  }).action, 'menu');

  assert.equal(classifySpinnerRelease({
    dx: 120,
    dy: 0,
    durationMs: 120,
    selectionHeldMs: 20
  }).action, 'menu');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { selectSpinnerDirection } from '../spinner-direction.js';

test('spinner directional selection maps cardinal drags to portal destinations', () => {
  assert.equal(selectSpinnerDirection(0, -60), 'day');
  assert.equal(selectSpinnerDirection(60, 0), 'work');
  assert.equal(selectSpinnerDirection(0, 60), 'build');
  assert.equal(selectSpinnerDirection(-60, 0), 'apps');
});

test('spinner directional selection follows the dominant drag axis', () => {
  assert.equal(selectSpinnerDirection(70, -30), 'work');
  assert.equal(selectSpinnerDirection(-72, 20), 'apps');
  assert.equal(selectSpinnerDirection(22, -70), 'day');
  assert.equal(selectSpinnerDirection(-18, 68), 'build');
});

test('spinner keeps short playful drags from navigating', () => {
  assert.equal(selectSpinnerDirection(20, 20), '');
  assert.equal(selectSpinnerDirection(43, 0), '');
  assert.equal(selectSpinnerDirection(44, 0), 'work');
});

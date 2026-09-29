import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceCheckpointState,
  chooseNearestTangentHeading,
  wrapAngle
} from '../prism-racer/physics.js';

test('Prism Racer starts tangent to the track instead of pointing inward', () => {
  const heading = chooseNearestTangentHeading(42, 0, 0);
  assert.ok(Math.abs(wrapAngle(heading)) < 1e-9);
});

test('Prism Racer magnetic heading keeps the nearest travel direction', () => {
  const ccw = chooseNearestTangentHeading(0, 42, -Math.PI / 2);
  const cw = chooseNearestTangentHeading(0, 42, Math.PI / 2);
  assert.ok(Math.abs(wrapAngle(ccw + Math.PI / 2)) < 1e-9);
  assert.ok(Math.abs(wrapAngle(cw - Math.PI / 2)) < 1e-9);
});

test('Prism Racer advances laps only after completing the full checkpoint loop', () => {
  let state = { nextCheckpoint: 1, lap: 1 };

  for (let checkpoint = 1; checkpoint < 8; checkpoint += 1) {
    state = {
      ...state,
      ...advanceCheckpointState({
        nextCheckpoint: state.nextCheckpoint,
        lap: state.lap,
        checkpointCount: 8,
        totalLaps: 3
      })
    };
  }

  assert.equal(state.nextCheckpoint, 0);
  assert.equal(state.lap, 1);

  state = {
    ...state,
    ...advanceCheckpointState({
      nextCheckpoint: state.nextCheckpoint,
      lap: state.lap,
      checkpointCount: 8,
      totalLaps: 3
    })
  };

  assert.equal(state.nextCheckpoint, 1);
  assert.equal(state.lap, 2);
  assert.equal(state.lapAdvanced, true);
});

test('Prism Racer finishes on the third completed lap', () => {
  const state = advanceCheckpointState({
    nextCheckpoint: 0,
    lap: 3,
    checkpointCount: 8,
    totalLaps: 3
  });

  assert.equal(state.finished, true);
  assert.equal(state.lap, 3);
});

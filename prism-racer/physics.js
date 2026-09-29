export function wrapAngle(angle) {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

export function chooseNearestTangentHeading(x, z, heading) {
  const trackAngle = Math.atan2(z, x);
  const counterClockwise = wrapAngle(-trackAngle);
  const clockwise = wrapAngle(counterClockwise + Math.PI);
  const ccwDelta = Math.abs(wrapAngle(counterClockwise - heading));
  const cwDelta = Math.abs(wrapAngle(clockwise - heading));
  return ccwDelta <= cwDelta ? counterClockwise : clockwise;
}

export function advanceCheckpointState({
  nextCheckpoint,
  lap,
  checkpointCount,
  totalLaps
}) {
  if (nextCheckpoint === checkpointCount - 1) {
    return { nextCheckpoint: 0, lap, lapAdvanced: false, finished: false };
  }

  if (nextCheckpoint === 0) {
    if (lap >= totalLaps) {
      return { nextCheckpoint: 1, lap, lapAdvanced: false, finished: true };
    }

    return {
      nextCheckpoint: 1,
      lap: lap + 1,
      lapAdvanced: true,
      finished: false
    };
  }

  return {
    nextCheckpoint: nextCheckpoint + 1,
    lap,
    lapAdvanced: false,
    finished: false
  };
}

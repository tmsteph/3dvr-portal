export function clamp(value, min, max) {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function computeProgress(playerZ, winDistance) {
  if (winDistance <= 0) return 1;
  return clamp(playerZ / winDistance, 0, 1);
}

export function computeForwardSpeed(baseSpeed, maxBonus, progress) {
  return baseSpeed + maxBonus * clamp(progress, 0, 1);
}

export function consumeFuel(currentFuel, deltaSeconds, options = {}) {
  const {
    isThrusting = false,
    idleDrain = 1,
    thrustDrain = 8,
    maxFuel = 100,
  } = options;
  const safeDelta = Math.max(0, deltaSeconds);
  const burnRate = isThrusting ? thrustDrain : idleDrain;
  const nextFuel = currentFuel - burnRate * safeDelta;
  return clamp(nextFuel, 0, maxFuel);
}

export function addFuel(currentFuel, amount, maxFuel = 100) {
  return clamp(currentFuel + Math.max(0, amount), 0, maxFuel);
}

export function applyDamage(currentShield, amount) {
  return clamp(currentShield - Math.max(0, amount), 0, 100);
}

export function createSeededRng(seed = 1) {
  // LCG keeps spawn layouts stable between runs for predictable tuning and test coverage.
  let state = Math.floor(seed) % 2147483647;
  if (state <= 0) {
    state += 2147483646;
  }
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

export function createTrackPoint(index, totalPoints, options = {}) {
  const safeTotal = Math.max(2, totalPoints);
  const t = clamp(index / (safeTotal - 1), 0, 1);
  const {
    startZ = 18,
    length = 320,
    amplitude = 8,
    waves = 4,
    baseY = 2.2,
    ySwing = 0.75,
  } = options;
  return {
    x: Math.sin(t * Math.PI * waves) * amplitude,
    y: baseY + Math.cos(t * Math.PI * (waves + 1)) * ySwing,
    z: startZ + t * length,
  };
}

export function generateSpawnPoints(options = {}) {
  const {
    count = 20,
    startZ = 24,
    spacing = 14,
    seed = 1,
    xSpread = 10,
    baseY = 1.8,
    yJitter = 0.9,
    zJitter = 4,
  } = options;

  const rng = createSeededRng(seed);
  const points = [];

  for (let index = 0; index < count; index += 1) {
    const x = (rng() * 2 - 1) * xSpread;
    const y = baseY + (rng() * 2 - 1) * yJitter;
    const z = startZ + index * spacing + (rng() * 2 - 1) * zJitter;
    const scale = 0.8 + rng() * 0.9;

    points.push({
      x,
      y,
      z,
      scale,
    });
  }

  points.sort((a, b) => a.z - b.z);
  return points;
}

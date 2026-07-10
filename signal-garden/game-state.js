export function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function createSeededRng(seed = 1) {
  let state = Math.floor(seed) % 2147483647;
  if (state <= 0) {
    state += 2147483646;
  }

  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

export function createGardenNodes(options = {}) {
  const {
    count = 18,
    width = 100,
    height = 100,
    margin = 10,
    seed = 1,
  } = options;
  const rng = createSeededRng(seed);
  const nodes = [];
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const safeMargin = Math.max(0, Math.min(margin, safeWidth / 3, safeHeight / 3));

  for (let index = 0; index < count; index += 1) {
    const ring = index % 3;
    const pulse = 0.7 + rng() * 0.8;
    nodes.push({
      id: `spark-${index}`,
      x: safeMargin + rng() * (safeWidth - safeMargin * 2),
      y: safeMargin + rng() * (safeHeight - safeMargin * 2),
      radius: 8 + ring * 2 + rng() * 5,
      pulse,
      value: 10 + ring * 5,
      active: true,
      collectedAt: null,
    });
  }

  return nodes;
}

export function distanceBetween(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

export function collectNearbyNodes(player, nodes, options = {}) {
  const {
    collectionRadius = 28,
    time = 0,
    comboWindow = 1.25,
    lastCollectTime = -Infinity,
    combo = 0,
  } = options;
  let score = 0;
  let collected = 0;
  let nextCombo = combo;
  const nextNodes = nodes.map((node) => {
    if (!node.active || distanceBetween(player, node) > collectionRadius + node.radius) {
      return node;
    }

    collected += 1;
    nextCombo = time - lastCollectTime <= comboWindow ? nextCombo + 1 : 1;
    score += node.value + Math.max(0, nextCombo - 1) * 4;

    return {
      ...node,
      active: false,
      collectedAt: time,
    };
  });

  return {
    nodes: nextNodes,
    collected,
    combo: collected > 0 ? nextCombo : combo,
    score,
    lastCollectTime: collected > 0 ? time : lastCollectTime,
  };
}

export function advancePlayer(player, input, deltaSeconds, bounds) {
  const speed = player.speed ?? 220;
  const dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
  const length = Math.hypot(dx, dy) || 1;
  const boost = input.boost ? 1.55 : 1;
  const nextX = player.x + (dx / length) * speed * boost * deltaSeconds;
  const nextY = player.y + (dy / length) * speed * boost * deltaSeconds;

  return {
    ...player,
    x: clamp(nextX, player.radius, bounds.width - player.radius),
    y: clamp(nextY, player.radius, bounds.height - player.radius),
  };
}

export function computeGardenGrade(score, collected, totalNodes) {
  const completion = totalNodes <= 0 ? 1 : collected / totalNodes;
  if (completion >= 1 && score >= totalNodes * 16) return 'Bloom';
  if (completion >= 0.7) return 'Awake';
  if (completion >= 0.4) return 'Gathering';
  return 'Seed';
}

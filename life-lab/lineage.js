export function circularDifference(a, b) {
  const raw = Math.abs(Number(a || 0) - Number(b || 0)) % 1;
  return Math.min(raw, 1 - raw);
}

export function geneDistance(childGenes = {}, parentGenes = {}) {
  const speed = Math.abs(Number(childGenes.speed || 0) - Number(parentGenes.speed || 0));
  const sense = Math.abs(Number(childGenes.sense || 0) - Number(parentGenes.sense || 0));
  const size = Math.abs(Number(childGenes.size || 0) - Number(parentGenes.size || 0));
  const hue = circularDifference(childGenes.hue, parentGenes.hue);
  return Math.sqrt(speed * speed + (sense / 5) * (sense / 5) + size * size + hue * hue);
}

export function ancestorChain(records, creatureId, limit = 10) {
  const lookup = records instanceof Map ? records : new Map(records.map((record) => [record.id, record]));
  const chain = [];
  let current = lookup.get(creatureId);

  while (current && chain.length < limit) {
    chain.push(current);
    current = current.parentId ? lookup.get(current.parentId) : null;
  }

  return chain;
}

export function descendantsOf(records, creatureId) {
  const list = records instanceof Map ? [...records.values()] : records;
  const children = new Map();

  list.forEach((record) => {
    if (!record.parentId) return;
    if (!children.has(record.parentId)) children.set(record.parentId, []);
    children.get(record.parentId).push(record.id);
  });

  const descendants = [];
  const queue = [...(children.get(creatureId) || [])];
  while (queue.length) {
    const id = queue.shift();
    descendants.push(id);
    queue.push(...(children.get(id) || []));
  }
  return descendants;
}

export function summarizeLineage(records, livingCreatureIds, lineageId) {
  const list = records instanceof Map ? [...records.values()] : records;
  const living = livingCreatureIds instanceof Set ? livingCreatureIds : new Set(livingCreatureIds || []);
  const family = list.filter((record) => record.lineage === lineageId);
  const livingFamily = family.filter((record) => living.has(record.id));
  const livingTotal = living.size;

  return {
    born: family.length,
    living: livingFamily.length,
    extinct: family.length > 0 && livingFamily.length === 0,
    share: livingTotal ? livingFamily.length / livingTotal : 0,
    maxGeneration: family.length ? Math.max(...family.map((record) => record.generation || 0)) : 0,
  };
}

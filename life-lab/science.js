export function mean(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function pearsonCorrelation(xs, ys) {
  if (!xs.length || xs.length !== ys.length || xs.length < 2) return 0;
  const meanX = mean(xs);
  const meanY = mean(ys);
  let numerator = 0;
  let varianceX = 0;
  let varianceY = 0;

  for (let index = 0; index < xs.length; index += 1) {
    const dx = xs[index] - meanX;
    const dy = ys[index] - meanY;
    numerator += dx * dy;
    varianceX += dx * dx;
    varianceY += dy * dy;
  }

  const denominator = Math.sqrt(varianceX * varianceY);
  return denominator ? numerator / denominator : 0;
}

export function normalizedEntropy(values, bins = 8, min = 0, max = 1) {
  if (!values.length || bins < 2 || max <= min) return 0;
  const counts = Array.from({ length: bins }, () => 0);

  values.forEach((value) => {
    const normalized = Math.max(0, Math.min(0.999999, (value - min) / (max - min)));
    counts[Math.floor(normalized * bins)] += 1;
  });

  const entropy = counts.reduce((total, count) => {
    if (!count) return total;
    const probability = count / values.length;
    return total - probability * Math.log(probability);
  }, 0);

  return entropy / Math.log(bins);
}

export function summarizePopulation(creatures, totals = {}) {
  const population = creatures.length;
  const births = Number(totals.births || 0);
  const deaths = Number(totals.deaths || 0);

  if (!population) {
    return {
      population: 0,
      births,
      deaths,
      generation: 0,
      survivalRate: 0,
      diversity: 0,
      meanSpeed: 0,
      meanSense: 0,
      meanSize: 0,
      livingLineages: 0,
      dominantLineageShare: 0,
      energyCorrelation: { trait: 'speed', value: 0 },
    };
  }

  const speeds = creatures.map((creature) => creature.genes.speed);
  const senses = creatures.map((creature) => creature.genes.sense);
  const sizes = creatures.map((creature) => creature.genes.size);
  const hues = creatures.map((creature) => creature.genes.hue);
  const energies = creatures.map((creature) => creature.energy);
  const correlations = [
    ['speed', pearsonCorrelation(speeds, energies)],
    ['sense', pearsonCorrelation(senses, energies)],
    ['size', pearsonCorrelation(sizes, energies)],
  ].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  const lineageCounts = new Map();
  creatures.forEach((creature) => {
    const lineage = creature.lineage || 'unknown';
    lineageCounts.set(lineage, (lineageCounts.get(lineage) || 0) + 1);
  });
  const dominantLineageCount = Math.max(...lineageCounts.values());

  return {
    population,
    births,
    deaths,
    generation: Math.max(...creatures.map((creature) => creature.generation)),
    survivalRate: population / Math.max(1, population + deaths),
    diversity: normalizedEntropy(hues, 10, 0, 1),
    meanSpeed: mean(speeds),
    meanSense: mean(senses),
    meanSize: mean(sizes),
    livingLineages: lineageCounts.size,
    dominantLineageShare: dominantLineageCount / population,
    energyCorrelation: {
      trait: correlations[0][0],
      value: correlations[0][1],
    },
  };
}

export function selectionNarrative(summary) {
  if (!summary.population) {
    return 'The population collapsed. Add food or start a new universe and compare the outcome.';
  }

  const correlation = summary.energyCorrelation.value;
  const direction = correlation >= 0 ? 'higher' : 'lower';
  const strength = Math.abs(correlation);
  const confidenceWord = strength > 0.45 ? 'strongly' : strength > 0.2 ? 'moderately' : 'weakly';
  const lineageSentence = summary.livingLineages
    ? ` The largest family holds ${(summary.dominantLineageShare * 100).toFixed(0)}% of the living population across ${summary.livingLineages} lineages.`
    : '';

  return `${summary.energyCorrelation.trait} is ${confidenceWord} associated with ${direction} survivor energy (r=${correlation.toFixed(2)}). Diversity is ${(summary.diversity * 100).toFixed(0)}%.${lineageSentence} Treat this as an exploratory signal, not proof of causation.`;
}

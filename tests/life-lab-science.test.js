import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizedEntropy,
  pearsonCorrelation,
  selectionNarrative,
  summarizePopulation,
} from '../life-lab/science.js';

test('normalizedEntropy reports low and high diversity', () => {
  assert.equal(normalizedEntropy([0.1, 0.1, 0.1, 0.1], 4, 0, 1), 0);
  assert.ok(normalizedEntropy([0.05, 0.3, 0.55, 0.8], 4, 0, 1) > 0.99);
});

test('pearsonCorrelation detects aligned traits and energy', () => {
  assert.ok(pearsonCorrelation([1, 2, 3, 4], [2, 4, 6, 8]) > 0.99);
  assert.ok(pearsonCorrelation([1, 2, 3, 4], [8, 6, 4, 2]) < -0.99);
});

test('summarizePopulation returns usable evolutionary metrics', () => {
  const creatures = [
    { lineage: 'alpha', genes: { speed: 1, sense: 5, size: 0.8, hue: 0.05 }, energy: 40, generation: 2 },
    { lineage: 'alpha', genes: { speed: 2, sense: 7, size: 1.1, hue: 0.35 }, energy: 65, generation: 3 },
    { lineage: 'beta', genes: { speed: 3, sense: 9, size: 1.4, hue: 0.75 }, energy: 90, generation: 4 },
  ];
  const summary = summarizePopulation(creatures, { births: 8, deaths: 2 });

  assert.equal(summary.population, 3);
  assert.equal(summary.generation, 4);
  assert.equal(summary.births, 8);
  assert.equal(summary.deaths, 2);
  assert.ok(summary.diversity > 0.4);
  assert.equal(summary.livingLineages, 2);
  assert.ok(Math.abs(summary.dominantLineageShare - 2 / 3) < 1e-9);
  assert.equal(summary.energyCorrelation.trait, 'speed');
  assert.ok(summary.energyCorrelation.value > 0.99);
  assert.match(selectionNarrative(summary), /largest family holds 67%/i);
  assert.match(selectionNarrative(summary), /exploratory signal/i);
});

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ancestorChain,
  circularDifference,
  descendantsOf,
  geneDistance,
  summarizeLineage,
} from '../life-lab/lineage.js';

const founder = {
  id: 'founder',
  parentId: null,
  lineage: 'founder',
  generation: 0,
  genes: { speed: 1, sense: 5, size: 1, hue: 0.98 },
};

const child = {
  id: 'child',
  parentId: 'founder',
  lineage: 'founder',
  generation: 1,
  genes: { speed: 1.2, sense: 6, size: 1.1, hue: 0.02 },
};

const grandchild = {
  id: 'grandchild',
  parentId: 'child',
  lineage: 'founder',
  generation: 2,
  genes: { speed: 1.3, sense: 6.5, size: 1.05, hue: 0.03 },
};

const outsider = {
  id: 'outsider',
  parentId: null,
  lineage: 'outsider',
  generation: 0,
  genes: { speed: 3, sense: 9, size: 0.7, hue: 0.5 },
};

const records = new Map([
  [founder.id, founder],
  [child.id, child],
  [grandchild.id, grandchild],
  [outsider.id, outsider],
]);

test('circular hue difference crosses the zero boundary correctly', () => {
  assert.ok(Math.abs(circularDifference(0.98, 0.02) - 0.04) < 1e-9);
});

test('gene distance is zero for identical genes and positive for mutations', () => {
  assert.equal(geneDistance(founder.genes, founder.genes), 0);
  assert.ok(geneDistance(child.genes, founder.genes) > 0);
});

test('ancestor chain walks from selected creature back to founder', () => {
  assert.deepEqual(
    ancestorChain(records, 'grandchild').map((record) => record.id),
    ['grandchild', 'child', 'founder']
  );
});

test('descendants include children and later generations', () => {
  assert.deepEqual(descendantsOf(records, 'founder'), ['child', 'grandchild']);
  assert.deepEqual(descendantsOf(records, 'child'), ['grandchild']);
});

test('lineage summary measures living family share and max generation', () => {
  const summary = summarizeLineage(records, new Set(['child', 'grandchild', 'outsider']), 'founder');
  assert.equal(summary.born, 3);
  assert.equal(summary.living, 2);
  assert.equal(summary.maxGeneration, 2);
  assert.ok(Math.abs(summary.share - 2 / 3) < 1e-9);
  assert.equal(summary.extinct, false);
});

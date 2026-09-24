import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { buildProtocol } from '../science/experiment-builder.js';

test('Science Lab teaches participatory science and replication', async () => {
  const page = await readFile(new URL('../science/index.html', import.meta.url), 'utf8');

  assert.match(page, /Everyone can do science\./);
  assert.match(page, /Observe<\/span>/i);
  assert.match(page, /Replicate<\/span>/i);
  assert.match(page, /What result would change your mind\?/);
  assert.match(page, /Replication is the superpower\./);
  assert.match(page, /id="experiment-form"/);
});

test('experiment builder emits a reproducible protocol', () => {
  const protocol = buildProtocol({
    title: 'Basil light test',
    question: 'Does morning light change growth?',
    hypothesis: 'Morning light increases weekly height.',
    test: 'Two extra hours of morning light',
    measurement: 'Plant height in millimeters every day',
    controls: 'Same soil, water, pot size, and seed batch',
    disconfirm: 'No meaningful height difference after 21 days',
    replications: 4
  });

  assert.match(protocol, /^# Basil light test/m);
  assert.match(protocol, /## What would count against the hypothesis\?/);
  assert.match(protocol, /4 independent runs\./);
  assert.match(protocol, /Raw measurements before interpretation/);
  assert.match(protocol, /Share the method with the result/);
});

test('experiment builder bounds replication targets', () => {
  assert.match(buildProtocol({ replications: 0 }), /1 independent run\./);
  assert.match(buildProtocol({ replications: 5000 }), /1000 independent runs\./);
  assert.match(buildProtocol({ replications: 'nope' }), /3 independent runs\./);
});

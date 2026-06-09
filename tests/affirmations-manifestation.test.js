import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('Affirmations Studio includes grounded manifestation practice', async () => {
  const html = await readFile(new URL('../meditation/affirmations.html', import.meta.url), 'utf8');

  assert.match(html, /Grounded manifestation/);
  assert.match(html, /Turn the vision into a next move/);
  assert.match(html, /Name the wish/);
  assert.match(html, /face the obstacle/);
  assert.match(html, /if\/then plan/);

  assert.match(html, /id="manifestationForm"/);
  assert.match(html, /id="wishText"/);
  assert.match(html, /id="outcomeText"/);
  assert.match(html, /id="obstacleText"/);
  assert.match(html, /id="planText"/);
  assert.match(html, /id="copyManifestation"/);
  assert.match(html, /id="clearManifestation"/);

  assert.match(html, /3dvr\.manifestationPractice\.v1/);
  assert.match(html, /function readManifestationPractice\(\)/);
  assert.match(html, /function saveManifestationPractice\(practice\)/);
  assert.match(html, /function formatManifestationPractice\(practice\)/);
  assert.match(html, /window\.localStorage\.setItem\(manifestationKey/);
  assert.match(html, /navigator\.clipboard\.writeText\(formatManifestationPractice\(practice\)\)/);

  assert.doesNotMatch(html, /guaranteed manifestation/i);
  assert.doesNotMatch(html, /manifest anything instantly/i);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('human-scale technology page frames the 3DVR strategy', async () => {
  const html = await readFile(new URL('../human-scale-tech/index.html', import.meta.url), 'utf8');

  assert.match(html, /Human-scale technology ecosystem/);
  assert.match(html, /understandable, repairable, local/);
  assert.match(html, /trusted open-source digital infrastructure layer/);
  assert.match(html, /Become useful/);
  assert.match(html, /Become trusted/);
  assert.match(html, /Build the ecosystem/);
  assert.match(html, /<script defer src="\/issue-launcher\.js"><\/script>/);
});

test('portal app dock links to the human-scale technology page', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

  assert.match(html, /href="human-scale-tech\/"/);
  assert.match(html, /Human-Scale Tech/);
  assert.match(html, /Plan the trusted, open, healthy technology ecosystem behind 3DVR\./);
  assert.doesNotMatch(html, /Suggested launcher lanes/);
  assert.doesNotMatch(html, /System layers/);
});

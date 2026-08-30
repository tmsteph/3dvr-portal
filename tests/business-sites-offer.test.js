import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const page = await readFile(new URL('../business-sites/index.html', import.meta.url), 'utf8');
const guide = await readFile(new URL('../guides/business-website/index.html', import.meta.url), 'utf8');

test('business websites offer leads with a concrete customer outcome', () => {
  assert.match(page, /Make it easier for the right customer to say yes/);
  assert.match(page, /call, book, request a quote, or buy/);
  assert.match(page, /Get a free first draft/);
  assert.match(page, /\$5–\$50\/month/);
  assert.match(page, /No promise of guaranteed leads/);
  assert.match(page, /business-website/);
});

test('business website guide is people-first and has a clear next step', () => {
  assert.match(guide, /one job: help the right person take the next step/);
  assert.match(guide, /Show proof before adjectives/);
  assert.match(guide, /Make mobile the first test/);
  assert.match(guide, /href="\.\.\/\.\.\/free-page\/#brief"/);
});

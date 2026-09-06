import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Labs is discoverable without replacing the four homepage intents', async () => {
  const [home, labs, search] = await Promise.all([
    read('home-operator.js'),
    read('labs/index.html'),
    read('operator/app-search.js')
  ]);

  assert.match(home, /href = '\/labs\/'/);
  assert.match(home, /app\.dataset\.threedvrLabsApp/);
  assert.doesNotMatch(home, /data\.threedvrOsLauncher/);
  assert.match(search, /title: 'Labs', href: '\/labs\/'/);
  assert.match(search, /title: 'Life Lab', href: '\/life-lab\/'/);
  assert.match(labs, /href="\.\.\/life-lab\/"/);
  assert.match(labs, /href="\.\.\/noteverse\/"/);
  assert.match(labs, /href="\.\.\/calendar\/13\/"/);
  assert.match(labs, /href="\.\.\/digital-organism\/"/);
});

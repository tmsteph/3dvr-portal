import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Living World ships as an in-portal evolving 3D experience', async () => {
  const page = await read('living-world/index.html');

  assert.match(page, /Living World · 3DVR/);
  assert.match(page, /three@0\.176\.0\/build\/three\.module\.js/);
  assert.match(page, /id="world-prompt"/);
  assert.match(page, /World dreams/);
  assert.match(page, /dreamWorld\(false\)/);
  assert.match(page, /deviceorientation/);
  assert.match(page, /localStorage\.setItem\(STORAGE_KEY/);
});

test('Living World is discoverable from Labs and Operator search', async () => {
  const [labs, search] = await Promise.all([
    read('labs/index.html'),
    read('operator/app-search.js')
  ]);

  assert.match(labs, /href="\.\.\/living-world\/"/);
  assert.match(search, /title: 'Living World', href: '\/living-world\/'/);
});

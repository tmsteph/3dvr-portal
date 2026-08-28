import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const vercel = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));

test('Vercel builds main and opt-in preview bridges while skipping ordinary branches', () => {
  assert.deepEqual(vercel.git?.deploymentEnabled, {
    '**': false,
    main: true,
    'preview-pr-*': true,
  });
  assert.equal(vercel.ignoreCommand, undefined);
});

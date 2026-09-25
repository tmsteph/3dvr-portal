import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const vercel = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));

test('Vercel Git deployments are disabled for every branch', () => {
  assert.deepEqual(vercel.git?.deploymentEnabled, {
    '**': false,
  });
  assert.equal(vercel.ignoreCommand, undefined);
});

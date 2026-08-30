import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const vercel = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));

test('Vercel skips routine main builds and ordinary branches while allowing opt-in preview bridges', () => {
  assert.deepEqual(vercel.git?.deploymentEnabled, {
    '**': false,
    main: false,
    'preview-pr-*': true,
  });
  assert.equal(vercel.ignoreCommand, undefined);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const vercel = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));

test('Vercel deploys production from main and never auto-builds feature branches', () => {
  assert.deepEqual(vercel.git?.deploymentEnabled, {
    '*': false,
    main: true,
  });
  assert.equal(
    vercel.ignoreCommand,
    '[ "$VERCEL_GIT_COMMIT_REF" != "main" ]'
  );
});

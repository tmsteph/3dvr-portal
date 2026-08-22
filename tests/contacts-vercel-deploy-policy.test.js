import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const config = JSON.parse(
  await readFile(new URL('../contacts/vercel.json', import.meta.url), 'utf8')
);

test('standalone Contacts cannot auto-deploy from Git pushes', () => {
  assert.equal(config.git?.deploymentEnabled, false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Operator Forge actions return links to the exact stored record', async () => {
  const forge = await read('operator/forge.js');

  assert.match(forge, /forgeRecordUrl\('suggestion', id\)/);
  assert.match(forge, /forgeRecordUrl\('edit', id\)/);
  assert.match(forge, /label: 'Forge suggestion'/);
  assert.match(forge, /label: 'Forge edit'/);
  assert.match(forge, /\/forge\/record\.html/);
});

test('Forge record page opens only safe display fields from the requested record', async () => {
  const page = await read('forge/record.html');
  const client = await read('forge/record.js');

  assert.match(page, /data-record-status/);
  assert.match(page, /record\.js/);
  assert.match(client, /kind === 'edit' \? 'editRequests' : 'suggestions'/);
  assert.match(client, /record\.resultSummary/);
  assert.match(client, /record\.error/);
  assert.doesNotMatch(client, /authProof/);
  assert.doesNotMatch(client, /authPub/);
});

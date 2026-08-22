import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('homepage embeds a context-aware Operator bar', async () => {
  const homepage = await read('index.html');
  const client = await read('home-operator.js');

  assert.match(homepage, /id="homeOperatorForm"/);
  assert.match(homepage, /id="homeOperatorInput"/);
  assert.match(homepage, /class="operator-link operator-bar"/);
  assert.match(homepage, /<script type="module" src="\/home-operator\.js"><\/script>/);
  assert.match(client, /collectPortalContext/);
  assert.match(client, /portalContext\.page = collectPageContext\(\)/);
  assert.match(client, /runOperatorAction/);
  assert.match(client, /provider=operator/);
});

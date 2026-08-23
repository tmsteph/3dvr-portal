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

test('homepage Operator sends the signed developer proof used by full Operator', async () => {
  const client = await read('home-operator.js');

  assert.match(client, /createOperatorDeveloperProof/);
  assert.match(client, /const \[portalContext, developerAuth\] = await Promise\.all/);
  assert.match(client, /createOperatorDeveloperProof\(\)/);
  assert.match(client, /requestOperator\(\{ prompt, history: prior, portalContext, developerAuth \}\)/);
});

test('homepage busy state lives in the Operator input instead of the status line', async () => {
  const client = await read('home-operator.js');

  assert.match(client, /input\.placeholder = busy \? 'Operator is working on this page…' : idlePlaceholder/);
  assert.match(client, /setBusy\(true\);\n\s*status\.textContent = '';/);
  assert.doesNotMatch(client, /status\.textContent = 'Operator is working on this page…'/);
});

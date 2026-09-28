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
  assert.match(client, /const requestOperator = .*fetchOperatorStream/);
});

test('homepage Operator sends the signed developer proof used by full Operator', async () => {
  const client = await read('home-operator.js');

  assert.match(client, /createOperatorDeveloperProof/);
  assert.match(client, /const \[portalContext, developerAuth, memoryContext\] = await Promise\.all/);
  assert.match(client, /createDeveloperProofWithRetry\(\)/);
  assert.match(client, /setTimeout\(resolve, 1400\)/);
  assert.match(client, /fetchOperatorStream/);
  assert.match(client, /onReplyDelta/);
  assert.match(client, /streamedReply \+= delta/);
  assert.match(client, /onStatus: message/);
});

test('homepage busy state is calm and streaming does not rebuild the response card', async () => {
  const homepage = await read('index.html');
  const client = await read('home-operator.js');
  const actions = await read('operator/actions.js');
  const busyUi = await read('operator/home-busy-state.js');

  assert.match(client, /input\.placeholder = busy \? 'Operator is working on this page…' : idlePlaceholder/);
  assert.match(client, /setBusy\(true\);\n\s*status\.textContent = '';\n\s*beginResponse\(\);/);
  assert.match(client, /operator-mini-portal-breathe/);
  assert.doesNotMatch(client, /operator-mini-portal-spin/);
  assert.doesNotMatch(client, /rotate\(-360deg\)/);
  assert.match(client, /queueReplyPaint\(streamedReply\)/);
  assert.doesNotMatch(client, /renderResponse\(\{ message: streamedReply \}\)/);
  assert.match(homepage, /\.operator-follow-ups \{[\s\S]*?min-height: 38px;[\s\S]*?flex-wrap: nowrap;/);
  assert.match(homepage, /\.operator-follow-ups:empty \{ display: none; \}/);
  assert.match(homepage, /body\[data-home-chat-active="true"\] \.operator-result \{[\s\S]*?max-height: min\(48dvh, 32rem\);[\s\S]*?align-self: start;/);
  assert.match(actions, /import '\.\/home-busy-state\.js';/);
  assert.match(busyUi, /const BUSY_TEXT = 'Operator is working on this page…'/);
  assert.match(busyUi, /form\.getAttribute\('aria-busy'\) === 'true'/);
  assert.doesNotMatch(busyUi, /input\.value = BUSY_TEXT/);
});

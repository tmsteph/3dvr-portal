import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isSafeOperatorHref } from '../operator/markdown.js';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Operator Markdown only allows safe link targets', () => {
  assert.equal(isSafeOperatorHref('https://portal.3dvr.tech/operator/'), true);
  assert.equal(isSafeOperatorHref('/operator/'), true);
  assert.equal(isSafeOperatorHref('../plan/'), true);
  assert.equal(isSafeOperatorHref('javascript:alert(1)'), false);
  assert.equal(isSafeOperatorHref('//example.com/path'), false);
});

test('home and full Operator use the shared Markdown renderer', async () => {
  const [home, full, homepage] = await Promise.all([
    read('home-operator.js'),
    read('operator/app.js'),
    read('index.html'),
  ]);
  assert.match(home, /paintOperatorMarkdown\(reply, pendingReplyText\)/);
  assert.match(full, /paintOperatorMarkdown\(node,item\.content\)/);
  assert.match(full, /paintOperatorMarkdown\(content,message\.content\)/);
  assert.match(homepage, /id="homeOperatorReply" class="operator-markdown"/);
  assert.doesNotMatch(home, /reply\.textContent = pendingReplyText/);
});

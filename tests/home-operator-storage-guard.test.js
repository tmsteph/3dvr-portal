import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

// Regression: on 2026-11-09 the homepage send button died silently for a
// heavy user. persistHistory() ran before the submit handler's try block
// and wrote the whole conversation store with an unguarded
// localStorage.setItem; once the origin's storage was full, that write
// threw QuotaExceededError and the tap did nothing at all: no busy state,
// no error, no request. The cache write must never be able to block a send.
test('homepage conversation cache writes are guarded and prune instead of throwing', async () => {
  const client = await read('home-operator.js');

  assert.match(client, /const writeConversationStore = store =>/);
  assert.match(client, /for \(const keep of \[20, 5, 1\]\)/);
  assert.match(client, /localStorage\.setItem\(conversationStoreKey, JSON\.stringify\(candidate\)\)/);
  assert.doesNotMatch(client, /localStorage\.setItem\(conversationStoreKey, JSON\.stringify\(store\)\)/);
  assert.doesNotMatch(client, /localStorage\.setItem\(conversationStoreKey, JSON\.stringify\(merged\)\)/);

  // persistHistory itself can no longer throw into the submit handler.
  assert.match(client, /const persistHistory = \(\) => \{\n    try \{\n      persistHistoryInner\(\);/);
  assert.match(client, /writeConversationStore\(store\)/);
  assert.match(client, /writeConversationStore\(merged\)/);
});

test('full Operator conversation writes use the same guarded writer', async () => {
  const app = await read('operator/app.js');

  assert.match(app, /const writeStore=\(value\)=>/);
  assert.doesNotMatch(app, /localStorage\.setItem\(KEY,JSON\.stringify\(store\)\)/);
  assert.match(app, /writeStore\(store\)/);
});

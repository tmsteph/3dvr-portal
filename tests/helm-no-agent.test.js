import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../helm/app.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../helm/index.html', import.meta.url), 'utf8');

test('Helm header never hardcodes the owner username or a test badge', () => {
  assert.doesNotMatch(html, /Private · tmsteph/);
  assert.doesNotMatch(html, /Agent test/);
  assert.match(html, /Private workspace/);
});

test('Helm explains no-agent accounts instead of promising a ready agent', () => {
  assert.match(app, /No agent assigned to this account/);
  assert.match(app, /Helm agents run on a server owned by the member/);
  assert.match(app, /will not send until an agent is assigned/);
});

test('Helm announces queued-message expiry instead of dropping silently', () => {
  assert.match(app, /expired without sending/);
  assert.match(app, /kept in History/);
});

test('Helm translates raw IndexedDB errors into plain language', () => {
  assert.match(app, /plainStorageError/);
  assert.match(app, /local message store closed unexpectedly/);
});

test('Helm history has an empty state', () => {
  assert.match(app, /No conversations yet/);
});

test('Helm treats the handler 401/403 refusals as the no-agent state', () => {
  assert.match(app, /error\.noAgent = response\.status === 401 \|\| response\.status === 403/);
  assert.match(app, /\/private to\/i/);
  assert.match(app, /no agent assigned to this account';/);
});

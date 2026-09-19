import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [connect, listener, legacy] = await Promise.all([
  readFile(new URL('../3dvr-connect/index.html', import.meta.url), 'utf8'),
  readFile(new URL('../3dvr-connect/presence/index.html', import.meta.url), 'utf8'),
  readFile(new URL('../presence-audio/index.html', import.meta.url), 'utf8'),
]);

test('Shared Presence lives in 3DVR Connect while Companion remains the recorder', () => {
  assert.match(connect, /id="shared-presence"/);
  assert.match(connect, />Shared Presence</);
  assert.match(connect, /3DVR Companion handles the phone microphone and local recording/);
  assert.match(connect, /href="\/3dvr-connect\/presence\/"/);
  assert.match(listener, /Shared Presence · 3DVR Connect/);
  assert.match(listener, /\/api\/presence-audio\/status/);
  assert.match(listener, /\/api\/presence-audio\/recordings\//);
  assert.match(legacy, /\/3dvr-connect\/presence\//);
});

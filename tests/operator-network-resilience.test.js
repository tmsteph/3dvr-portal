import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Operator persists a lightweight pending request and waits for mobile connectivity to recover', async () => {
  const actions = await read('operator/actions.js');
  const network = await read('operator/network-resilience.js');

  assert.match(actions, /import '\.\/network-resilience\.js';/);
  assert.match(network, /3dvr\.operator\.pending-request\.v1/);
  assert.match(network, /storage\.setItem\(PENDING_KEY/);
  assert.match(network, /prompt: requestPrompt\(init\)/);
  assert.doesNotMatch(network, /developerAuth/);
  assert.match(network, /target\?\.navigator\?\.onLine === false/);
  assert.match(network, /visibilityState === 'hidden'/);
  assert.match(network, /addEventListener\?\.\('online', check\)/);
  assert.match(network, /addEventListener\?\.\('pageshow', check\)/);
  assert.match(network, /addEventListener\?\.\('visibilitychange', check\)/);
  assert.match(network, /Paused while the screen is away…/);
  assert.match(network, /Waiting for connection…/);
  assert.match(network, /Reconnecting to Operator…/);
  assert.match(network, /RETRY_DELAYS_MS = \[650, 1500, 3000, 5000, 8000, 12000, 20000, 30000\]/);
  assert.match(network, /clearPendingRequest\(target, pending\)/);
});

test('Operator still retries only browser-level POST failures, not HTTP responses', async () => {
  const network = await read('operator/network-resilience.js');

  assert.match(network, /url\.pathname === '\/api\/openai-site'/);
  assert.match(network, /url\.searchParams\.get\('provider'\) === 'operator'/);
  assert.match(network, /requestMethod\(input, init\) === 'POST'/);
  assert.match(network, /const response = await originalFetch\(input, init\);/);
  assert.doesNotMatch(network, /response\.status/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Operator retries browser-level fetch failures once without retrying HTTP responses', async () => {
  const actions = await read('operator/actions.js');
  const network = await read('operator/network-resilience.js');

  assert.match(actions, /import '\.\/network-resilience\.js';/);
  assert.match(network, /url\.pathname === '\/api\/openai-site'/);
  assert.match(network, /url\.searchParams\.get\('provider'\) === 'operator'/);
  assert.match(network, /requestMethod\(input, init\) === 'POST'/);
  assert.match(network, /return await originalFetch\(input, init\);/);
  assert.match(network, /await sleep\(RETRY_DELAY_MS\);/);
  assert.match(network, /return await originalFetch\(input, init\);/g);
  assert.match(network, /Connection to Operator was interrupted\. Please try again\./);
  assert.doesNotMatch(network, /response\.status/);
});

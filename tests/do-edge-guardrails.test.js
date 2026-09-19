import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('DigitalOcean edge gives AI requests a longer response budget than ordinary APIs', async () => {
  const script = await readFile(
    new URL('../ops/resilience/install-do-edge-guardrails.sh', import.meta.url),
    'utf8'
  );

  const aiIndex = script.indexOf('@ai_api path /api/openai-site*');
  const apiIndex = script.indexOf('@api path /api/*');

  assert.ok(aiIndex >= 0, 'AI route matcher should exist');
  assert.ok(apiIndex > aiIndex, 'AI route must be handled before the generic API route');

  const aiBlock = script.slice(aiIndex, apiIndex);
  assert.match(aiBlock, /response_header_timeout 75s/);
  assert.match(aiBlock, /unhealthy_latency 75s/);

  const genericBlock = script.slice(apiIndex);
  assert.match(genericBlock, /response_header_timeout 15s/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('DigitalOcean edge gives AI requests a longer response budget than ordinary APIs', async () => {
  const script = await readFile(
    new URL('../ops/resilience/install-do-edge-guardrails.sh', import.meta.url),
    'utf8'
  );

  const aiIndex = script.indexOf('@ai_api path /api/openai-site*');
  const secretIndex = script.indexOf('@secret_api path /api/secrets-broker /api/secret-handoff');
  const apiIndex = script.indexOf('@api path /api/*');

  assert.ok(aiIndex >= 0, 'AI route matcher should exist');
  assert.ok(secretIndex > aiIndex, 'secret routes should be handled after the dedicated AI route');
  assert.ok(apiIndex > secretIndex, 'secret routes must be handled before the generic API route');

  const secretBlock = script.slice(secretIndex, apiIndex);
  assert.match(secretBlock, /reverse_proxy 127\.0\.0\.1:14320 \{/);
  assert.doesNotMatch(secretBlock, /14322/);

  const aiBlock = script.slice(aiIndex, apiIndex);
  assert.match(aiBlock, /response_header_timeout 75s/);
  assert.match(aiBlock, /unhealthy_latency 75s/);

  const genericBlock = script.slice(apiIndex);
  assert.match(genericBlock, /response_header_timeout 15s/);
});

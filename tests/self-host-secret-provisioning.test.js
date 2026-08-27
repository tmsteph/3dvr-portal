import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('self-host deploy preserves server secrets when Actions has no secret updates', async () => {
  const workflow = await readFile(new URL('../.github/workflows/self-host-production.yml', import.meta.url), 'utf8');

  assert.match(workflow, /No runtime secret updates supplied; preserving the server configuration\./);
  assert.doesNotMatch(workflow, /No OpenAI or AI Gateway API key is configured for Operator/);
  assert.match(workflow, /portal-secrets\.update/);
  assert.match(workflow, /touch "\$secrets_env"/);
  assert.match(workflow, /grep -v "\^\$\{key\}=" "\$next"/);
  assert.match(workflow, /printf '%s\\n' "\$line" >> "\$next"/);
});

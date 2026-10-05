import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { isPrivateStaticPath } from '../scripts/self-host-static-policy.mjs';

const root = new URL('../', import.meta.url);

test('Operator startup and action modules stay reachable through the self-host static policy', async () => {
  const pending = ['/home-operator.js', '/operator/app.js', '/operator/delegate-task.js', '/operator/agent-edit-queue.js'];
  const visited = new Set();
  while (pending.length) {
    const path = pending.pop();
    if (visited.has(path)) continue;
    visited.add(path);
    assert.equal(isPrivateStaticPath(path), false, `Browser dependency is private: ${path}`);
    const source = await readFile(new URL(`.${path}`, root), 'utf8');
    for (const match of source.matchAll(/(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)["']([^"']+)["']/g)) {
      const specifier = match[1];
      if (!specifier.startsWith('.') && !specifier.startsWith('/')) continue;
      pending.push(new URL(specifier, `https://portal.3dvr.tech${path}`).pathname);
    }
  }
  assert.ok(visited.has('/src/operator-runtime/action-receipt.js'));
  assert.ok(visited.has('/src/kernel/positiveSum.js'));
});

test('self-host still denies server source, configuration and directory paths', () => {
  for (const path of ['/src/', '/src/operator-runtime/', '/src/operator/api.js', '/src/secrets-broker/handler.js', '/src/operator-runtime/revenue-workflow.js', '/api/openai-site.js', '/scripts/self-host-server.mjs', '/ops/', '/package.json', '/AGENTS.md']) {
    assert.equal(isPrivateStaticPath(path), true, path);
  }
});

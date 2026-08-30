import assert from 'node:assert/strict';
import { stat } from 'node:fs/promises';
import test from 'node:test';

const scripts = [
  '../apps/agent/thomas-agent/scripts/ask-agent-worker-daemon',
  '../apps/agent/thomas-agent/scripts/ask-agent-supervisor-daemon',
  '../apps/agent/thomas-agent/scripts/ask-context-task-router-daemon',
];

test('agent daemon entrypoints stay executable for self-host deploys', async () => {
  for (const script of scripts) {
    const info = await stat(new URL(script, import.meta.url));
    assert.ok(info.mode & 0o111, `${script} must be executable`);
  }
});

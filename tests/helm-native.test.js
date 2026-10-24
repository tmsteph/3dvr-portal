import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('native bridge preserves conversation boundaries and rejects incomplete or oversized results', () => {
  const result = spawnSync('python3', [fileURLToPath(new URL('./helm-native-python.py', import.meta.url))],
    { encoding: 'utf8', timeout: 10000 });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
});

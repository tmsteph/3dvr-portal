import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('dedicated Operator client parses as valid JavaScript', () => {
  const result = spawnSync(process.execPath, ['--check', 'operator/app.js'], {
    encoding: 'utf8'
  });

  assert.equal(
    result.status,
    0,
    [result.stdout, result.stderr].filter(Boolean).join('\n')
  );
});

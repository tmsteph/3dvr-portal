import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

test('Operator page stays on its own origin', async () => {
  const html = await readFile(new URL('../operator/index.html', import.meta.url), 'utf8');
  assert.ok(!html.includes('location.replace('));
  assert.ok(html.includes('href="/operator/operator.webmanifest"'));
});

test('Caddy migration preserves unrelated sites, is idempotent, and refuses unknown configurations', () => {
  const result = spawnSync('python3', ['-c', String.raw`
import importlib.util
spec = importlib.util.spec_from_file_location('operator_origin', 'scripts/ops/prepare-operator-origin.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
prefix = 'portal.3dvr.tech {\n reverse_proxy 127.0.0.1:4320\n}\nother.example {\n respond "untouched"\n}\n'
original = prefix + 'operator.3dvr.tech {\n encode zstd gzip\n ' + module.LEGACY + '\n}\n'
prepared = module.prepare(original)
assert prepared.startswith(prefix)
assert 'encode zstd gzip' in prepared
assert module.LEGACY not in prepared
assert module.DIRECT in prepared
assert module.prepare(prepared) == prepared
for unknown in [prefix, original + original]:
 try:
  module.prepare(unknown)
 except ValueError:
  pass
 else:
  raise AssertionError('Unrecognized/ambiguous config was modified')
`], { encoding: 'utf8', cwd: new URL('../', import.meta.url) });
  assert.equal(result.status, 0, result.stderr);
});

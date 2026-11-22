import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const workflow = readFileSync(new URL('../.github/workflows/cloud-health.yml', import.meta.url), 'utf8');
const marker = 'if grep -Fxq "3dvr_remote_session=connected" <<<"$metrics"; then';
const start = workflow.indexOf(marker);
assert.ok(start >= 0, 'Cloud Health must distinguish a connected remote probe failure');
const endMarker = '\n                  fi';
const end = workflow.indexOf(endMarker, start);
assert.ok(end > start, 'Cloud Health must close the probe-result classification branch');
// Execute the *actual* nonzero-exit classification branch from the workflow with
// synthetic output. No SSH, credentials, customer services, or network required.
const branch = workflow.slice(start, end + endMarker.length);

function classify(output) {
  const script = `probe() {
    local name=Hetzner host=mock.example user=fixture metrics="$1"
    ${branch}
    echo "::error::$name could not establish a working SSH session ($host)"
    return 1
  }
  probe "$1"`;
  const result = spawnSync('bash', ['-c', script, '--', output], {
    encoding: 'utf8', timeout: 3000,
  });
  assert.equal(result.error, undefined);
  return result;
}

test('reached SSH session with failing remote probe is distinguished from auth failure', () => {
  const result = classify('3dvr_remote_session=connected\nold_blocked_processes:4');
  assert.equal(result.status, 2);
  assert.match(result.stdout, /SSH succeeded via fixture@mock\.example, but remote health probe failed/);
  assert.doesNotMatch(result.stdout, /could not establish a working SSH session/);
});

test('SSH/auth failure without marker preserves unreachable classification', () => {
  const result = classify('Permission denied (publickey).');
  assert.equal(result.status, 1);
  assert.match(result.stdout, /could not establish a working SSH session/);
});

test('partial or embedded marker cannot be mistaken for a reached SSH session', () => {
  const result = classify('error: 3dvr_remote_session=connected but denied');
  assert.equal(result.status, 1);
  assert.match(result.stdout, /could not establish a working SSH session/);
});

test('connected marker is emitted before independent reliability probe', () => {
  const emission = workflow.indexOf("printf '3dvr_remote_session=connected\\n'");
  const probe = workflow.indexOf('python3 /usr/local/sbin/3dvr-cloud-reliability-health');
  assert.ok(emission >= 0 && probe > emission, 'session marker must precede the independent probe');
});

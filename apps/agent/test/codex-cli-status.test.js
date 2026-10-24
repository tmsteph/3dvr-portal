const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const cli = path.join(__dirname, '..', 'thomas-agent', 'scripts', 'ask-agent-codex');

function runStatus({ versionCode = 0, loginCode = 0 } = {}) {
  const temp = mkdtempSync(path.join(os.tmpdir(), '3dvr-codex-status-'));
  try {
    const bin = path.join(temp, 'bin');
    mkdirSync(bin);
    const mock = path.join(bin, 'codex');
    writeFileSync(mock, [
      '#!/bin/sh',
      'if [ "$1" = "--version" ]; then',
      '  echo "codex mock"',
      '  exit ' + versionCode,
      'fi',
      'if [ "$1" = "login" ] && [ "$2" = "status" ]; then',
      '  exit ' + loginCode,
      'fi',
      'echo "unexpected codex invocation" >&2',
      'exit 99',
      '',
    ].join('\n'));
    chmodSync(mock, 0o755);
    return spawnSync('bash', [cli, 'status'], {
      encoding: 'utf8',
      timeout: 5000,
      env: { ...process.env, PATH: bin + path.delimiter + process.env.PATH },
    });
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

test('Codex status succeeds when binary and login checks succeed', () => {
  const result = runStatus();
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /codex path:/);
});

test('Codex status fails closed on login failure instead of reporting healthy', () => {
  const result = runStatus({ loginCode: 1 });
  assert.equal(result.error, undefined);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /login status failed in this execution context/);
});

test('Codex status fails closed when version check fails', () => {
  const result = runStatus({ versionCode: 1 });
  assert.equal(result.error, undefined);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /version check failed in this execution context/);
});

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { OpenBaoBackend, locatorPath, worker } = require('../connectors/secrets/openbao');

test('locatorPath hides source key and preserves locator family', () => {
  const byKey = locatorPath({ key: 'STRIPE_SECRET_KEY' });
  const byId = locatorPath({ id: 'secret-123' });
  assert.match(byKey, /^runtime\/by-key\/[a-f0-9]{64}$/);
  assert.match(byId, /^runtime\/by-id\/[a-f0-9]{64}$/);
  assert.equal(byKey.includes('STRIPE'), false);
  assert.notEqual(byKey, byId);
});

test('OpenBaoBackend passes credentials by protected files, not command arguments', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), '3dvr-openbao-'));
  const roleIdFile = path.join(dir, 'role-id');
  const secretIdFile = path.join(dir, 'secret-id');
  fs.writeFileSync(roleIdFile, 'fixture-role-id\n', { mode: 0o600 });
  fs.writeFileSync(secretIdFile, 'fixture-secret-id\n', { mode: 0o600 });
  let invocation;
  const backend = new OpenBaoBackend({ roleIdFile, secretIdFile }, {
    run(file, args, options) {
      invocation = { file, args, input: JSON.parse(options.input) };
      return { status: 0, stdout: JSON.stringify({ ok: true, value: 'fixture-value' }), stderr: '' };
    },
  });

  assert.equal(backend.ready(), true);
  assert.equal(backend.get({ key: 'EXAMPLE_TOKEN' }), 'fixture-value');
  assert.deepEqual(invocation.args.slice(-1), ['--worker']);
  assert.equal(invocation.args.join(' ').includes('fixture-role-id'), false);
  assert.equal(invocation.args.join(' ').includes('fixture-secret-id'), false);
  assert.match(invocation.input.path, /^runtime\/by-key\/[a-f0-9]{64}$/);
});

test('OpenBaoBackend writes key and optional legacy id aliases through the helper', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), '3dvr-openbao-'));
  const roleIdFile = path.join(dir, 'role-id');
  const secretIdFile = path.join(dir, 'secret-id');
  fs.writeFileSync(roleIdFile, 'role\n');
  fs.writeFileSync(secretIdFile, 'secret\n');
  const calls = [];
  const backend = new OpenBaoBackend({ roleIdFile, secretIdFile }, {
    run(_file, _args, options) {
      calls.push(JSON.parse(options.input));
      return { status: 0, stdout: JSON.stringify({ ok: true }), stderr: '' };
    },
  });

  const created = backend.create({ key: 'API_KEY', value: 'sensitive-fixture', sourceId: 'legacy-id' });
  assert.equal(created.backend, 'openbao');
  assert.equal(calls.length, 2);
  assert.match(calls[0].path, /^runtime\/by-key\/[a-f0-9]{64}$/);
  assert.match(calls[1].path, /^runtime\/by-id\/[a-f0-9]{64}$/);
  assert.equal(calls[0].data.value, 'sensitive-fixture');
});

test('OpenBao helper preserves a bounded failure stage without exposing secret names', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), '3dvr-openbao-stage-'));
  try {
    const roleIdFile = path.join(dir, 'role-id');
    const secretIdFile = path.join(dir, 'secret-id');
    fs.writeFileSync(roleIdFile, 'fixture-role-id');
    fs.writeFileSync(secretIdFile, 'fixture-secret-id');
    const backend = new OpenBaoBackend({ roleIdFile, secretIdFile }, {
      run() {
        return { status: 1, stdout: '', stderr: JSON.stringify({
          error: 'OpenBao request failed (404)',
          stage: 'kv_read',
        }) };
      },
    });
    assert.throws(() => backend.get({ key: 'MATRIX_GITTER_TMSTEPH' }), error => {
      assert.equal(error.message, 'OpenBao request failed (404) [stage=kv_read]');
      assert.equal(error.message.includes('MATRIX_GITTER_TMSTEPH'), false);
      return true;
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('OpenBao worker distinguishes login 404 from KV-read 404 without printing paths', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), '3dvr-openbao-worker-'));
  const roleIdFile = path.join(dir, 'role-id');
  const secretIdFile = path.join(dir, 'secret-id');
  fs.writeFileSync(roleIdFile, 'fixture-role-id');
  fs.writeFileSync(secretIdFile, 'fixture-secret-id');
  const previousFetch = global.fetch;
  t.after(() => {
    global.fetch = previousFetch;
    fs.rmSync(dir, { recursive: true, force: true });
  });
  let loginMissing = true;
  global.fetch = async url => {
    if (String(url).endsWith('/v1/auth/approle/login') && !loginMissing) {
      return new Response(JSON.stringify({ auth: { client_token: 'fixture-token' } }), { status: 200 });
    }
    return new Response(JSON.stringify({ errors: [] }), { status: 404 });
  };
  const input = {
    config: { addr: 'http://127.0.0.1:8200', roleIdFile, secretIdFile },
    operation: 'get',
    path: locatorPath({ key: 'MATRIX_GITTER_TMSTEPH' }),
  };
  await assert.rejects(worker(input), error => error.openBaoStage === 'approle_login' && /404/.test(error.message));
  loginMissing = false;
  await assert.rejects(worker(input), error => error.openBaoStage === 'kv_read' && /404/.test(error.message));
});

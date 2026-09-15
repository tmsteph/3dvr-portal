import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { BitwardenSecretsManagerBackend } = require('../apps/agent/thomas-agent/node/secrets-broker.js');

function successJson(value) {
  return { status: 0, stdout: JSON.stringify(value), stderr: '', error: null };
}

test('Bitwarden backend resolves a stable project/key locator before fetching the value', () => {
  const calls = [];
  const run = (_binary, args) => {
    calls.push(args);
    if (args[0] === 'project' && args[1] === 'list') {
      return successJson([{ id: 'project-1', name: '3dvr Agent' }]);
    }
    if (args[0] === 'secret' && args[1] === 'list') {
      return successJson([{ id: 'secret-1', key: 'IATSE_PORTAL_PASSWORD' }]);
    }
    if (args[0] === 'secret' && args[1] === 'get') {
      return successJson({ id: 'secret-1', key: 'IATSE_PORTAL_PASSWORD', value: 'fixture-secret' });
    }
    throw new Error(`unexpected command: ${args.join(' ')}`);
  };
  const backend = new BitwardenSecretsManagerBackend({ binary: '/bin/true' }, {
    env: { BWS_ACCESS_TOKEN: 'fixture-machine-token' },
    run,
  });

  const value = backend.get({ projectName: '3dvr Agent', key: 'IATSE_PORTAL_PASSWORD' });
  assert.equal(value, 'fixture-secret');
  assert.equal(calls[0][0], 'project');
  assert.deepEqual(calls[1].slice(0, 3), ['secret', 'list', 'project-1']);
  assert.deepEqual(calls[2].slice(0, 3), ['secret', 'get', 'secret-1']);
});

test('Bitwarden backend keeps direct secret-id locators working', () => {
  const calls = [];
  const backend = new BitwardenSecretsManagerBackend({ binary: '/bin/true' }, {
    env: { BWS_ACCESS_TOKEN: 'fixture-machine-token' },
    run: (_binary, args) => {
      calls.push(args);
      return successJson({ id: 'secret-direct', value: 'fixture-direct' });
    },
  });
  assert.equal(backend.get('secret-direct'), 'fixture-direct');
  assert.deepEqual(calls[0].slice(0, 3), ['secret', 'get', 'secret-direct']);
});

test('Bitwarden backend fails closed when a stable key is missing', () => {
  const backend = new BitwardenSecretsManagerBackend({ binary: '/bin/true' }, {
    env: { BWS_ACCESS_TOKEN: 'fixture-machine-token' },
    run: (_binary, args) => {
      if (args[0] === 'project') return successJson([{ id: 'project-1', name: '3dvr Agent' }]);
      if (args[0] === 'secret' && args[1] === 'list') return successJson([]);
      throw new Error('secret get must not run');
    },
  });
  assert.throws(
    () => backend.get({ projectName: '3dvr Agent', key: 'IATSE_PORTAL_PASSWORD' }),
    /secret key was not found/i,
  );
});

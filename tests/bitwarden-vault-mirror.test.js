import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';
import { buildMirrorPlan, mirrorRecord } from '../scripts/ops/import-bitwarden-export-to-secrets-manager.mjs';

const require = createRequire(import.meta.url);
const { SecretsBroker } = require('../apps/agent/thomas-agent/node/secrets-broker.js');

test('vault mirror keeps automation fields and strips passkeys/password history', () => {
  const result = mirrorRecord({
    id: '12345678-aaaa-bbbb-cccc-123456789abc',
    type: 1,
    name: 'Example Login',
    notes: 'automation note',
    passwordHistory: [{ password: 'old-secret' }],
    fields: [{ name: 'api-key', value: 'field-secret', type: 1 }],
    login: {
      username: 'me@example.com',
      password: 'current-secret',
      totp: 'otpauth://totp/example?secret=ABC',
      uris: [{ uri: 'https://example.com', match: null }],
      fido2Credentials: [{ credentialId: 'must-not-copy', keyValue: 'private-material' }],
    },
  });
  assert.ok(result.key.startsWith('VAULT_ITEM__LOGIN__EXAMPLE_LOGIN__'));
  const value = JSON.parse(result.value);
  assert.equal(value.login.password, 'current-secret');
  assert.equal(value.login.totp.startsWith('otpauth://'), true);
  assert.equal('passwordHistory' in value, false);
  assert.equal('fido2Credentials' in value.login, false);
  assert.equal(JSON.stringify(value).includes('private-material'), false);
  assert.equal(JSON.stringify(value).includes('old-secret'), false);
});

test('vault mirror defaults exclude root-of-trust, cards, identities, and ssh keys', () => {
  const plan = buildMirrorPlan({ items: [
    { id: '1', type: 1, name: 'Bitwarden', login: { uris: [{ uri: 'https://vault.bitwarden.com' }], username: 'a', password: 'b' } },
    { id: '2', type: 1, name: 'GitHub', login: { uris: [{ uri: 'https://github.com' }], username: 'a', password: 'b' } },
    { id: '3', type: 2, name: 'API Tokens', notes: 'token data', secureNote: {} },
    { id: '4', type: 3, name: 'Card', card: { number: '4111111111111111' } },
    { id: '5', type: 4, name: 'Identity', identity: { ssn: '123' } },
    { id: '6', type: 5, name: 'SSH', sshKey: { privateKey: 'private' } },
  ] });
  assert.equal(plan.records.length, 2);
  assert.equal(plan.skipped['root-of-trust'], 1);
  assert.equal(plan.skipped.card, 1);
  assert.equal(plan.skipped.identity, 1);
  assert.equal(plan.skipped['ssh-key'], 1);
  assert.equal(plan.index.count, 2);
  assert.equal(JSON.stringify(plan.index).includes('token data'), false);
});

test('broker wildcard policy converts a vault alias into a stable Bitwarden key', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), '3dvr-vault-policy-'));
  try {
    const policyFile = path.join(dir, 'policy.json');
    const agentsFile = path.join(dir, 'agents.json');
    const approvalsFile = path.join(dir, 'approvals.json');
    fs.writeFileSync(policyFile, JSON.stringify({
      version: 1,
      defaults: { approval: 'auto', leaseSeconds: 300, maxUses: 1 },
      backends: { bitwarden: { type: 'bitwarden-secrets-manager' } },
      secrets: {
        'vault.item.*': {
          backend: 'bitwarden',
          locator: { projectName: '3dvr Agent', keyFromAliasPrefix: 'vault.item.' },
          capability: 'secret.read',
          scopes: ['secrets:password-manager-mirror'],
          approval: { mode: 'auto' },
        },
      },
    }));
    fs.writeFileSync(agentsFile, JSON.stringify({ version: 1, agents: {} }));
    fs.writeFileSync(approvalsFile, JSON.stringify({ version: 1, approvals: {} }));
    let seenLocator;
    const broker = new SecretsBroker({
      policyFile, agentsFile, approvalsFile,
      audit: { append() {} },
      backends: { bitwarden: { get(locator) { seenLocator = locator; return 'fixture-value'; } } },
    });
    const result = broker.request({ id: 'browser', capabilities: ['secret.read'], scopes: ['secrets:password-manager-mirror'] }, {
      secret: 'vault.item.VAULT_ITEM__LOGIN__GITHUB__ABC123',
      capability: 'secret.read',
      scope: 'secrets:password-manager-mirror',
      purpose: 'fill a login',
    });
    assert.equal(result.status, 200);
    assert.equal(result.body.secret, 'fixture-value');
    assert.equal(seenLocator.key, 'VAULT_ITEM__LOGIN__GITHUB__ABC123');
    assert.equal(seenLocator.projectName, '3dvr Agent');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  BUNDLE_ALGORITHM,
  BUNDLE_KIND,
  BUNDLE_VERSION,
  parseBundleText,
  serializeBundle,
  validateBundle,
} from '../recovery-vault/bundle.js';

const page = await readFile(new URL('../recovery-vault/index.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../recovery-vault/app.js', import.meta.url), 'utf8');

function validBundle(overrides = {}) {
  return {
    version: BUNDLE_VERSION,
    kind: BUNDLE_KIND,
    rpId: '3dvr.tech',
    credentialId: 'abcdefgh',
    prfSalt: 'a'.repeat(43),
    iv: 'b'.repeat(16),
    ciphertext: 'c'.repeat(24),
    algorithm: BUNDLE_ALGORITHM,
    label: 'fixture',
    createdAt: '2026-09-14T21:00:00.000Z',
    ...overrides,
  };
}

test('Recovery Vault exposes a passkey-only dry run before real secret handling', () => {
  assert.match(page, /Enroll recovery passkey/);
  assert.match(page, /Run encrypted self-test/);
  assert.match(page, /throwaway text/i);
  assert.doesNotMatch(page, /type="password"/i);
});

test('Recovery Vault binds WebAuthn PRF to the canonical 3dvr.tech RP', () => {
  assert.match(app, /return '3dvr\.tech'/);
  assert.match(app, /extensions: \{ prf: \{ eval:/);
  assert.match(app, /evalByCredential/);
  assert.match(app, /userVerification: 'required'/);
  assert.match(app, /getClientExtensionResults/);
});

test('Recovery Vault derives a non-extractable AES-GCM key and clears PRF bytes', () => {
  assert.match(app, /AES-GCM/);
  assert.match(app, /importKey\('raw', material, \{ name: 'AES-GCM' \}, false/);
  assert.match(app, /material\.fill\(0\)/);
  assert.match(app, /crypto\.subtle\.encrypt/);
  assert.match(app, /crypto\.subtle\.decrypt/);
});

test('Recovery Vault keeps only non-secret enrollment metadata in browser storage', () => {
  assert.match(app, /localStorage\.setItem\(STORAGE_KEY, JSON\.stringify\(enrollment\)\)/);
  assert.doesNotMatch(app, /localStorage\.setItem\([^\n]*(password|secret|plaintext|ciphertext)/i);
  assert.doesNotMatch(app, /sessionStorage/);
  assert.doesNotMatch(app, /fetch\(|XMLHttpRequest|WebSocket/);
});

test('portable self-test bundle uses a strict allowlist', () => {
  const bundle = validateBundle(validBundle());
  assert.equal(bundle.kind, 'self-test');
  assert.equal(Object.isFrozen(bundle), true);
  assert.throws(() => validateBundle(validBundle({ password: 'never-allowed' })), /not allowed: password/);
  assert.throws(() => validateBundle(validBundle({ kind: 'root-secret' })), /Only self-test bundles/);
  assert.throws(() => validateBundle(validBundle({ rpId: 'evil.example' })), /3dvr\.tech/);
});

test('portable bundle parse and serialize preserve ciphertext-only schema', () => {
  const encoded = serializeBundle(validBundle());
  const decoded = parseBundleText(encoded);
  assert.equal(decoded.ciphertext, 'c'.repeat(24));
  assert.equal(decoded.algorithm, 'AES-256-GCM');
  assert.doesNotMatch(encoded, /password|plaintext|secretValue/i);
});

test('Recovery Vault exposes encrypted export/import and second-device recovery controls', () => {
  assert.match(page, /Export encrypted test bundle/);
  assert.match(page, /Import encrypted test bundle/);
  assert.match(page, /Recover imported test/);
  assert.match(app, /URL\.createObjectURL/);
  assert.match(app, /parseBundleText/);
  assert.match(app, /recoverImportedSelfTest/);
});

test('Recovery Vault clearly keeps real-secret storage disabled after the self-test', () => {
  assert.match(page, /No real credential will be requested/i);
  assert.match(app, /Real-secret storage is still disabled/);
});

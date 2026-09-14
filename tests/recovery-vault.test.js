import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const page = await readFile(new URL('../recovery-vault/index.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../recovery-vault/app.js', import.meta.url), 'utf8');

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

test('Recovery Vault clearly keeps real-secret storage disabled after the self-test', () => {
  assert.match(page, /No real credential will be requested/i);
  assert.match(app, /Real-secret storage remains intentionally disabled/);
});

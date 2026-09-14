import {
  BUNDLE_AAD,
  BUNDLE_ALGORITHM,
  BUNDLE_KIND,
  BUNDLE_VERSION,
  parseBundleText,
  serializeBundle,
  validateBundle,
} from './bundle.js';

const STORAGE_KEY = '3dvr-recovery-vault-enrollment-v1';
const SELF_TEST_TEXT = '3dvr-recovery-vault-self-test-v1';
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const byId = id => document.getElementById(id);
let latestSelfTestBundle = null;
let importedSelfTestBundle = null;

function randomBytes(length) {
  return crypto.getRandomValues(new Uint8Array(length));
}

function toBase64url(value) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64url(value) {
  const text = String(value || '');
  if (!/^[A-Za-z0-9_-]+$/.test(text)) throw new Error('Invalid recovery metadata encoding.');
  const normalized = text.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

function canonicalRpId() {
  const host = location.hostname.toLowerCase();
  if (host === '3dvr.tech' || host.endsWith('.3dvr.tech')) return '3dvr.tech';
  return '';
}

function loadEnrollment() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!parsed || parsed.version !== 1 || parsed.rpId !== '3dvr.tech') return null;
    if (!parsed.credentialId || !parsed.prfSalt) return null;
    fromBase64url(parsed.credentialId);
    fromBase64url(parsed.prfSalt);
    return parsed;
  } catch {
    return null;
  }
}

function saveEnrollment(enrollment) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(enrollment));
}

function setResult(message, state = '') {
  const result = byId('ceremonyResult');
  if (!result) return;
  result.textContent = message;
  result.dataset.state = state;
}

function setBundleResult(message, state = '') {
  const result = byId('bundleResult');
  if (!result) return;
  result.textContent = message;
  result.dataset.state = state;
}

function renderBundleState() {
  const exportButton = byId('exportSelfTestBundle');
  const recoverButton = byId('recoverImportedBundle');
  if (exportButton) exportButton.disabled = !latestSelfTestBundle;
  if (recoverButton) recoverButton.disabled = !importedSelfTestBundle;
}

function renderEnrollmentState({ announce = true } = {}) {
  const enrollment = loadEnrollment();
  const run = byId('runSelfTest');
  const forget = byId('forgetEnrollment');
  const enroll = byId('enrollPasskey');
  if (run) run.disabled = !enrollment;
  if (forget) forget.disabled = !enrollment;
  if (enroll && enrollment) {
    enroll.disabled = true;
    enroll.textContent = 'Recovery passkey enrolled ✓';
  } else if (enroll) {
    enroll.textContent = 'Enroll recovery passkey';
  }
  if (enrollment && announce) {
    setResult(`Recovery passkey metadata is enrolled on this browser (${enrollment.rpId}). No secret is stored here.`, 'ready');
  }
  return enrollment;
}

async function readiness() {
  const secure = Boolean(globalThis.isSecureContext);
  const webauthn = typeof PublicKeyCredential !== 'undefined' && Boolean(navigator.credentials);
  const webcrypto = Boolean(globalThis.crypto?.subtle);
  let platform = false;
  if (webauthn && typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function') {
    try { platform = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable(); } catch {}
  }
  const rp = canonicalRpId();
  return [
    { label: 'Secure HTTPS context', ok: secure, detail: secure ? 'Ready' : 'HTTPS is required.' },
    { label: 'WebAuthn / passkeys', ok: webauthn, detail: webauthn ? 'Available' : 'This browser does not expose WebAuthn.' },
    { label: 'Local biometric / device verifier', ok: platform, detail: platform ? 'Available' : 'A platform authenticator was not confirmed; a synced or external passkey may still work.' },
    { label: 'Web Crypto AES-GCM', ok: webcrypto, detail: webcrypto ? 'Available' : 'Web Crypto is unavailable.' },
    { label: 'Canonical 3dvr.tech RP', ok: Boolean(rp), detail: rp ? `Bound to ${rp}` : 'Open this page on a 3dvr.tech origin before enrollment.' },
  ];
}

async function renderReadiness() {
  const list = byId('readinessChecks');
  const checks = await readiness();
  if (list) {
    list.innerHTML = checks.map(check => `<div class="check-row"><span class="check-icon ${check.ok ? 'ok' : 'warn'}">${check.ok ? '✓' : '!'}</span><div><strong>${check.label}</strong><small>${check.detail}</small></div></div>`).join('');
  }
  const hardReady = checks.filter(check => ['Secure HTTPS context', 'WebAuthn / passkeys', 'Web Crypto AES-GCM', 'Canonical 3dvr.tech RP'].includes(check.label)).every(check => check.ok);
  const enrollment = loadEnrollment();
  byId('enrollPasskey').disabled = !hardReady || Boolean(enrollment);
  byId('vaultStatusTitle').textContent = enrollment ? 'Recovery passkey enrolled' : (hardReady ? 'Device is ready for a recovery passkey' : 'Recovery Vault needs one more prerequisite');
  byId('vaultStatusText').textContent = enrollment
    ? 'Run the encrypted self-test, export its ciphertext bundle, then import and recover that bundle on another trusted device.'
    : (hardReady ? 'Next we can verify PRF support with a dedicated passkey and throwaway encrypted data. No master password is involved.' : 'Resolve the warning items below before creating a recovery credential.');
  byId('vaultStatusDot').className = `status-dot ${hardReady ? 'ready' : 'attention'}`;
  renderEnrollmentState({ announce: false });
}

async function enrollRecoveryPasskey() {
  const rpId = canonicalRpId();
  if (!rpId) throw new Error('Recovery passkeys must be created from a 3dvr.tech origin.');
  const prfSalt = randomBytes(32);
  const credential = await navigator.credentials.create({
    publicKey: {
      challenge: randomBytes(32),
      rp: { id: rpId, name: '3DVR Recovery Vault' },
      user: { id: randomBytes(32), name: 'recovery-owner', displayName: '3DVR Recovery Owner' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      timeout: 60000,
      attestation: 'none',
      authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
      extensions: { prf: { eval: { first: prfSalt } } },
    },
  });
  if (!credential) throw new Error('Passkey enrollment was cancelled.');
  const prf = credential.getClientExtensionResults?.().prf;
  if (!prf?.enabled) throw new Error('That authenticator did not confirm WebAuthn PRF support. Try a different passkey provider or device.');
  saveEnrollment({
    version: 1,
    rpId,
    credentialId: toBase64url(credential.rawId),
    prfSalt: toBase64url(prfSalt),
    createdAt: new Date().toISOString(),
  });
  renderEnrollmentState({ announce: false });
  setResult('Recovery passkey enrolled. Only non-secret credential metadata was saved in this browser.', 'ready');
}

async function deriveKeyWithPasskey(metadata) {
  const credentialId = fromBase64url(metadata.credentialId);
  const prfSalt = fromBase64url(metadata.prfSalt);
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge: randomBytes(32),
      rpId: metadata.rpId,
      allowCredentials: [{ type: 'public-key', id: credentialId }],
      timeout: 60000,
      userVerification: 'required',
      extensions: { prf: { evalByCredential: { [metadata.credentialId]: { first: prfSalt } } } },
    },
  });
  const output = assertion?.getClientExtensionResults?.().prf?.results?.first;
  if (!output) throw new Error('This passkey did not return PRF key material during verification.');
  const material = new Uint8Array(output);
  try {
    return await crypto.subtle.importKey('raw', material, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  } finally {
    material.fill(0);
  }
}

async function createSelfTestBundle(enrollment, key) {
  const iv = randomBytes(12);
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(BUNDLE_AAD) },
    key,
    encoder.encode(SELF_TEST_TEXT),
  );
  return validateBundle({
    version: BUNDLE_VERSION,
    kind: BUNDLE_KIND,
    rpId: enrollment.rpId,
    credentialId: enrollment.credentialId,
    prfSalt: enrollment.prfSalt,
    iv: toBase64url(iv),
    ciphertext: toBase64url(encrypted),
    algorithm: BUNDLE_ALGORITHM,
    label: '3DVR Recovery Vault portability self-test',
    createdAt: new Date().toISOString(),
  });
}

async function decryptSelfTestBundle(bundle, key) {
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64url(bundle.iv), additionalData: encoder.encode(BUNDLE_AAD) },
    key,
    fromBase64url(bundle.ciphertext),
  );
  if (decoder.decode(decrypted) !== SELF_TEST_TEXT) throw new Error('Recovery bundle decrypted, but the self-test marker did not match.');
}

async function runEncryptedSelfTest() {
  const enrollment = loadEnrollment();
  if (!enrollment) throw new Error('Enroll a recovery passkey first.');
  const key = await deriveKeyWithPasskey(enrollment);
  const bundle = await createSelfTestBundle(enrollment, key);
  await decryptSelfTestBundle(bundle, key);
  latestSelfTestBundle = bundle;
  renderBundleState();
  setResult('Success ✓ Passkey PRF → encrypted portable bundle → local recovery works with throwaway data. You can now export the ciphertext-only test bundle.', 'ready');
  byId('vaultStatusTitle').textContent = 'Passkey encryption path verified';
  byId('vaultStatusText').textContent = 'Export the self-test bundle and recover it on another trusted device with the same synced passkey. Real-secret storage is still disabled.';
  byId('vaultStatusDot').className = 'status-dot ready';
}

function exportSelfTestBundle() {
  if (!latestSelfTestBundle) throw new Error('Run the encrypted self-test first.');
  const blob = new Blob([serializeBundle(latestSelfTestBundle)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `3dvr-recovery-self-test-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  setBundleResult('Encrypted self-test bundle exported. It contains ciphertext and passkey metadata only.', 'ready');
}

async function importSelfTestBundle(file) {
  if (!file) throw new Error('Choose an encrypted Recovery Vault bundle first.');
  if (file.size > 65536) throw new Error('Recovery bundle is larger than the allowed limit.');
  importedSelfTestBundle = parseBundleText(await file.text());
  renderBundleState();
  const date = importedSelfTestBundle.createdAt ? ` from ${new Date(importedSelfTestBundle.createdAt).toLocaleString()}` : '';
  setBundleResult(`Encrypted self-test bundle imported${date}. No decryption has happened yet.`, 'ready');
}

async function recoverImportedSelfTest() {
  if (!importedSelfTestBundle) throw new Error('Import an encrypted self-test bundle first.');
  const key = await deriveKeyWithPasskey(importedSelfTestBundle);
  await decryptSelfTestBundle(importedSelfTestBundle, key);
  setBundleResult('Recovery verified ✓ The imported ciphertext decrypted with this passkey and matched the self-test marker. This is the second-device recovery check we need before enabling real secrets.', 'ready');
}

byId('refreshReadiness')?.addEventListener('click', () => renderReadiness().catch(error => setResult(error.message, 'error')));
byId('enrollPasskey')?.addEventListener('click', async () => {
  setResult('Waiting for your passkey or biometric confirmation…');
  byId('enrollPasskey').disabled = true;
  try { await enrollRecoveryPasskey(); }
  catch (error) { setResult(error.message || 'Passkey enrollment failed.', 'error'); }
  finally { await renderReadiness(); }
});
byId('runSelfTest')?.addEventListener('click', async () => {
  setResult('Waiting for your passkey, then creating a portable encrypted self-test bundle…');
  byId('runSelfTest').disabled = true;
  try { await runEncryptedSelfTest(); }
  catch (error) { setResult(error.message || 'Encrypted self-test failed.', 'error'); }
  finally { renderEnrollmentState({ announce: false }); }
});
byId('forgetEnrollment')?.addEventListener('click', async () => {
  localStorage.removeItem(STORAGE_KEY);
  renderEnrollmentState({ announce: false });
  await renderReadiness();
  setResult('Local recovery metadata cleared. This does not delete the passkey from your device or passkey provider.');
});
byId('exportSelfTestBundle')?.addEventListener('click', () => {
  try { exportSelfTestBundle(); }
  catch (error) { setBundleResult(error.message || 'Bundle export failed.', 'error'); }
});
byId('importSelfTestBundle')?.addEventListener('click', () => byId('bundleFile')?.click());
byId('bundleFile')?.addEventListener('change', async event => {
  try { await importSelfTestBundle(event.target.files?.[0]); }
  catch (error) { importedSelfTestBundle = null; renderBundleState(); setBundleResult(error.message || 'Bundle import failed.', 'error'); }
  finally { event.target.value = ''; }
});
byId('recoverImportedBundle')?.addEventListener('click', async () => {
  setBundleResult('Waiting for your passkey, then attempting local recovery…');
  byId('recoverImportedBundle').disabled = true;
  try { await recoverImportedSelfTest(); }
  catch (error) { setBundleResult(error.message || 'Bundle recovery failed.', 'error'); }
  finally { renderBundleState(); }
});

Promise.allSettled([renderReadiness()]).then(() => {
  renderEnrollmentState();
  renderBundleState();
});

const STORAGE_KEY = '3dvr-recovery-vault-enrollment-v1';
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const byId = id => document.getElementById(id);

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
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
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
    if (!parsed || parsed.version !== 1 || !parsed.credentialId || !parsed.prfSalt || !parsed.rpId) return null;
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

function renderEnrollmentState() {
  const enrollment = loadEnrollment();
  const run = byId('runSelfTest');
  const forget = byId('forgetEnrollment');
  if (run) run.disabled = !enrollment;
  if (forget) forget.disabled = !enrollment;
  if (enrollment) {
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
  byId('enrollPasskey').disabled = !hardReady;
  byId('vaultStatusTitle').textContent = hardReady ? 'Device is ready for a recovery passkey' : 'Recovery Vault needs one more prerequisite';
  byId('vaultStatusText').textContent = hardReady
    ? 'Next we can verify PRF support with a dedicated passkey and throwaway encrypted data. No master password is involved.'
    : 'Resolve the warning items below before creating a recovery credential.';
  byId('vaultStatusDot').className = `status-dot ${hardReady ? 'ready' : 'attention'}`;
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
  const enrollment = {
    version: 1,
    rpId,
    credentialId: toBase64url(credential.rawId),
    prfSalt: toBase64url(prfSalt),
    createdAt: new Date().toISOString(),
  };
  saveEnrollment(enrollment);
  renderEnrollmentState();
  setResult('Recovery passkey enrolled. Only non-secret credential metadata was saved in this browser.', 'ready');
}

async function deriveKeyWithPasskey(enrollment) {
  const credentialId = fromBase64url(enrollment.credentialId);
  const prfSalt = fromBase64url(enrollment.prfSalt);
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge: randomBytes(32),
      rpId: enrollment.rpId,
      allowCredentials: [{ type: 'public-key', id: credentialId }],
      timeout: 60000,
      userVerification: 'required',
      extensions: { prf: { evalByCredential: { [enrollment.credentialId]: { first: prfSalt } } } },
    },
  });
  const output = assertion?.getClientExtensionResults?.().prf?.results?.first;
  if (!output) throw new Error('This passkey did not return PRF key material during verification.');
  return crypto.subtle.importKey('raw', output, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function runEncryptedSelfTest() {
  const enrollment = loadEnrollment();
  if (!enrollment) throw new Error('Enroll a recovery passkey first.');
  const key = await deriveKeyWithPasskey(enrollment);
  const iv = randomBytes(12);
  const plain = encoder.encode('3dvr-recovery-vault-self-test-v1');
  const aad = encoder.encode('3dvr-recovery-vault:v1:self-test');
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad }, key, plain);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: aad }, key, encrypted);
  if (decoder.decode(decrypted) !== decoder.decode(plain)) throw new Error('Encrypted self-test did not round-trip correctly.');
  setResult('Success ✓ Passkey PRF → local AES-256-GCM encryption works end to end with throwaway data. No recovery secret was used.', 'ready');
  byId('vaultStatusTitle').textContent = 'Passkey encryption path verified';
  byId('vaultStatusText').textContent = 'This device can derive encryption key material locally. Real-secret storage remains intentionally disabled until the bundle and recovery flow are reviewed.';
  byId('vaultStatusDot').className = 'status-dot ready';
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
  setResult('Waiting for your passkey, then testing local encryption…');
  byId('runSelfTest').disabled = true;
  try { await runEncryptedSelfTest(); }
  catch (error) { setResult(error.message || 'Encrypted self-test failed.', 'error'); }
  finally { renderEnrollmentState(); }
});
byId('forgetEnrollment')?.addEventListener('click', () => {
  localStorage.removeItem(STORAGE_KEY);
  setResult('Local recovery metadata cleared. This does not delete the passkey from your device or passkey provider.');
  renderEnrollmentState();
});

Promise.allSettled([renderReadiness()]).then(() => renderEnrollmentState());

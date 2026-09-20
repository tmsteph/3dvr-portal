const byId = id => document.getElementById(id);
const form = byId('secretForm');
const input = byId('secretValue');
const submit = byId('submitSecret');
const status = byId('status');
const receipt = byId('receipt');

function b64url(bytes) {
  let binary = '';
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function setStatus(message, error = false) {
  status.textContent = message;
  status.className = error ? 'status error' : 'status';
}

function readCapability() {
  const id = new URL(location.href).searchParams.get('id') || '';
  const fragment = new URLSearchParams(location.hash.replace(/^#/, ''));
  const fromLink = fragment.get('token') || '';
  const storageKey = id ? `3dvr-secret-handoff:${id}` : '';
  if (fromLink && storageKey) {
    sessionStorage.setItem(storageKey, fromLink);
    history.replaceState(null, '', `${location.pathname}?id=${encodeURIComponent(id)}`);
  }
  return { id, token: fromLink || (storageKey ? sessionStorage.getItem(storageKey) || '' : '') };
}

async function resolveControlOrigin() {
  const response = await fetch('/runtime/organism-bridge.json', {
    cache: 'no-store',
    credentials: 'same-origin',
  });
  if (!response.ok) throw new Error('The secure control plane is unavailable.');
  const payload = await response.json();
  const parsed = new URL(String(payload?.origin || ''));
  const allowed = parsed.protocol === 'https:' && (
    parsed.hostname === 'portal.3dvr.tech'
    || parsed.hostname === 'control.3dvr.tech'
    || parsed.hostname.endsWith('.trycloudflare.com')
  );
  if (!allowed) throw new Error('The secure control-plane address is invalid.');
  return parsed.origin;
}

let controlOriginPromise;
async function api(body) {
  controlOriginPromise ||= resolveControlOrigin();
  const origin = await controlOriginPromise;
  const response = await fetch(`${origin}/api/secret-handoff`, {
    method: 'POST',
    mode: 'cors',
    credentials: 'omit',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Secure handoff failed.');
  return payload;
}

async function encryptSecret(id, publicKeyJwk, value) {
  const recipientKey = await crypto.subtle.importKey(
    'jwk',
    publicKeyJwk,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
  const ephemeral = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits'],
  );
  const shared = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: recipientKey },
    ephemeral.privateKey,
    256,
  );
  const hkdfKey = await crypto.subtle.importKey('raw', shared, 'HKDF', false, ['deriveKey']);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const info = new TextEncoder().encode(`3dvr-secret-handoff:v1:${id}`);
  const aesKey = await crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt'],
  );
  const plaintext = new TextEncoder().encode(JSON.stringify({
    value,
    submittedAt: new Date().toISOString(),
  }));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: info, tagLength: 128 },
    aesKey,
    plaintext,
  );
  const epk = await crypto.subtle.exportKey('jwk', ephemeral.publicKey);
  return {
    v: 1,
    kem: 'P-256-ECDH',
    kdf: 'HKDF-SHA256',
    aead: 'AES-256-GCM',
    epk,
    salt: b64url(salt),
    iv: b64url(iv),
    ciphertext: b64url(ciphertext),
  };
}

const capability = readCapability();
let request = null;

async function load() {
  if (!capability.id || !capability.token) {
    byId('title').textContent = 'Invalid secure link';
    byId('purpose').textContent = 'This handoff link is missing its one-time capability.';
    return setStatus('Ask the sender for a new secure handoff link.', true);
  }
  try {
    const payload = await api({ action: 'describe', ...capability });
    request = payload.request;
    byId('title').textContent = request.recipient
      ? `${request.recipient}, securely send ${request.label}`
      : `Securely send ${request.label}`;
    byId('purpose').textContent = request.purpose || 'Send this secret directly to 3DVR.';
    byId('secretLabel').textContent = request.label;
    const expires = new Date(request.expiresAt);
    byId('expiry').textContent = Number.isNaN(expires.getTime())
      ? ''
      : `Expires ${expires.toLocaleString()}`;
    if (request.status === 'stored') {
      form.hidden = true;
      receipt.hidden = false;
      return setStatus('This one-time handoff has already been completed.');
    }
    if (request.status !== 'pending' || !request.publicKey) {
      form.hidden = true;
      return setStatus('This handoff is no longer active.', true);
    }
    form.hidden = false;
    setStatus('Ready. The secret will leave this device only as ciphertext.');
  } catch (error) {
    byId('title').textContent = 'Secure request unavailable';
    byId('purpose').textContent = '3DVR could not open this handoff.';
    setStatus(error.message, true);
  }
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  const value = input.value;
  if (!value) return setStatus('Paste the requested secret first.', true);
  if (!request?.publicKey) return setStatus('This secure request is not ready.', true);
  submit.disabled = true;
  input.disabled = true;
  try {
    setStatus('Encrypting on this device...');
    const envelope = await encryptSecret(capability.id, request.publicKey, value);
    setStatus('Sending ciphertext to 3DVR...');
    await api({ action: 'submit', ...capability, envelope });
    input.value = '';
    sessionStorage.removeItem(`3dvr-secret-handoff:${capability.id}`);
    form.hidden = true;
    receipt.hidden = false;
    setStatus('Stored. The plaintext was never sent through this page.');
  } catch (error) {
    setStatus(error.message, true);
    input.disabled = false;
    submit.disabled = false;
  }
});

load();

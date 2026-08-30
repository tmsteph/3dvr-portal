export const INVITE_PREFIX = 'rf1.';
export const VALID_KINDS = new Set(['committee', 'coalition']);

function encodeText(value) {
  const bytes = new TextEncoder().encode(String(value));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeText(value) {
  const normalized = String(value).replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4 || 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function randomToken(bytes = 18) {
  const values = new Uint8Array(bytes);
  crypto.getRandomValues(values);
  let binary = '';
  for (const value of values) binary += String.fromCharCode(value);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function createPrivateRef(kind) {
  if (!VALID_KINDS.has(kind)) throw new Error('Unknown network object type.');
  return { kind, id: randomToken(16), secret: randomToken(32) };
}

export function refKey(ref) {
  return `${ref.kind}:${ref.id}`;
}

export function buildInvite(ref) {
  if (!ref || !VALID_KINDS.has(ref.kind) || !ref.id || !ref.secret) {
    throw new Error('Cannot build an invite from an invalid reference.');
  }
  return `${INVITE_PREFIX}${encodeText(JSON.stringify({ v: 1, k: ref.kind, i: ref.id, s: ref.secret }))}`;
}

export function buildJoinUrl(ref, baseUrl) {
  const base = new URL(baseUrl || (typeof location !== 'undefined' ? location.href : 'https://portal.3dvr.tech/rank-and-file/'));
  base.hash = `join=${encodeURIComponent(buildInvite(ref))}`;
  base.search = '';
  return base.toString();
}

function extractCandidate(input) {
  const raw = String(input || '').trim();
  if (!raw) return '';
  if (raw.startsWith(INVITE_PREFIX)) return raw;
  try {
    const url = new URL(raw);
    const hash = url.hash.replace(/^#/, '');
    const params = new URLSearchParams(hash);
    return params.get('join') || '';
  } catch (_error) {
    const match = raw.match(/(?:^|[#?&])join=([^&]+)/);
    return match ? decodeURIComponent(match[1]) : raw;
  }
}

export function parseInvite(input, expectedKind) {
  const candidate = extractCandidate(input);
  if (!candidate.startsWith(INVITE_PREFIX)) throw new Error('That does not look like a Rank & File invite.');
  let payload;
  try {
    payload = JSON.parse(decodeText(candidate.slice(INVITE_PREFIX.length)));
  } catch (_error) {
    throw new Error('That invite could not be decoded.');
  }
  const ref = { kind: payload.k, id: payload.i, secret: payload.s };
  if (payload.v !== 1 || !VALID_KINDS.has(ref.kind) || !/^[A-Za-z0-9_-]{12,}$/.test(ref.id || '') || !/^[A-Za-z0-9_-]{24,}$/.test(ref.secret || '')) {
    throw new Error('That invite is incomplete or invalid.');
  }
  if (expectedKind && ref.kind !== expectedKind) throw new Error(`This is a ${ref.kind} invite, not a ${expectedKind} invite.`);
  return ref;
}

export function mergeRefs(existing, incoming) {
  const clean = Array.isArray(existing) ? existing.filter(ref => ref && VALID_KINDS.has(ref.kind) && ref.id && ref.secret) : [];
  if (!incoming) return clean;
  const key = refKey(incoming);
  return [...clean.filter(ref => refKey(ref) !== key), incoming];
}

export function removeRef(existing, target) {
  const key = refKey(target);
  return (Array.isArray(existing) ? existing : []).filter(ref => refKey(ref) !== key);
}

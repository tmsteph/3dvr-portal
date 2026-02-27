import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');
let authIdentitySource = '';

function createCookieDocument() {
  const jar = new Map();

  return {
    get cookie() {
      return Array.from(jar.entries())
        .map(([key, value]) => `${key}=${value}`)
        .join('; ');
    },
    set cookie(value) {
      const [pair, ...attributes] = String(value).split(';');
      const separator = pair.indexOf('=');
      if (separator === -1) return;
      const key = pair.slice(0, separator).trim();
      const val = pair.slice(separator + 1).trim();
      const shouldClear = attributes.some((attribute) =>
        attribute.trim().toLowerCase().startsWith('max-age=0')
      );
      if (shouldClear) {
        jar.delete(key);
        return;
      }
      jar.set(key, val);
    },
  };
}

function createStorage() {
  const data = new Map();
  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(String(key), String(value));
    },
    removeItem(key) {
      data.delete(String(key));
    },
  };
}

function loadAuthIdentity({ hostname = 'portal.3dvr.tech', documentObj, localStorage } = {}) {
  const documentRef = documentObj || createCookieDocument();
  const storageRef = localStorage || createStorage();
  const sandbox = {
    window: {
      document: documentRef,
      location: { hostname },
      localStorage: storageRef,
    },
  };
  vm.runInNewContext(authIdentitySource, sandbox, { filename: 'auth-identity.js' });
  return {
    api: sandbox.window.AuthIdentity,
    document: documentRef,
    localStorage: storageRef,
  };
}

describe('auth identity helper', () => {
  before(async () => {
    authIdentitySource = await readFile(resolve(projectRoot, 'auth-identity.js'), 'utf8');
  });

  it('writes and reads shared identity cookies', () => {
    const { api } = loadAuthIdentity();

    const wrote = api.writeSharedIdentity({
      signedIn: true,
      alias: 'agent@3dvr',
      username: 'Agent',
    });

    assert.equal(wrote, true);
    const identity = api.readSharedIdentity();
    assert.ok(identity);
    assert.equal(identity.alias, 'agent@3dvr');
    assert.equal(identity.username, 'Agent');
    assert.equal(identity.signedIn, true);
    assert.equal(Number.isFinite(identity.updatedAt), true);
  });

  it('syncs local storage from shared identity cookies', () => {
    const { api, localStorage } = loadAuthIdentity();
    localStorage.setItem('guest', 'true');
    localStorage.setItem('guestId', 'guest_abc');
    localStorage.setItem('guestDisplayName', 'Guest');

    api.writeSharedIdentity({
      signedIn: true,
      alias: 'pilot@3dvr',
      username: 'Pilot',
    });

    const changed = api.syncStorageFromSharedIdentity(localStorage);
    assert.equal(changed, true);
    assert.equal(localStorage.getItem('signedIn'), 'true');
    assert.equal(localStorage.getItem('alias'), 'pilot@3dvr');
    assert.equal(localStorage.getItem('username'), 'Pilot');
    assert.equal(localStorage.getItem('guest'), null);
    assert.equal(localStorage.getItem('guestId'), null);
    assert.equal(localStorage.getItem('guestDisplayName'), null);
  });

  it('clears shared identity cookies', () => {
    const { api } = loadAuthIdentity();

    api.writeSharedIdentity({
      signedIn: true,
      alias: 'clear@3dvr',
      username: 'Clear',
    });
    assert.ok(api.readSharedIdentity());

    const cleared = api.clearSharedIdentity();
    assert.equal(cleared, true);
    assert.equal(api.readSharedIdentity(), null);
  });
});

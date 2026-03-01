import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');
let source = '';

function createTrackingGun() {
  const store = new Map();

  function readSnapshotForPath(path = []) {
    const key = path.join('/');
    if (store.has(key)) {
      return store.get(key);
    }

    const prefix = key ? `${key}/` : '';
    const snapshot = {};
    let found = false;

    for (const [storedPath, value] of store.entries()) {
      if (!storedPath.startsWith(prefix)) continue;
      const remainder = storedPath.slice(prefix.length);
      if (!remainder || remainder.includes('/')) continue;
      snapshot[remainder] = value;
      found = true;
    }

    return found ? snapshot : undefined;
  }

  function node(path = []) {
    const key = path.join('/');
    return {
      _: {
        get: path[path.length - 1] || ''
      },
      get(next) {
        return node([...path, String(next)]);
      },
      put(value, callback) {
        store.set(key, value);
        callback?.({ ok: true });
        return this;
      },
      once(callback) {
        callback?.(readSnapshotForPath(path));
        return this;
      }
    };
  }

  return {
    gun: {
      get(next) {
        return node([String(next)]);
      }
    },
    store
  };
}

function loadApi() {
  const sandbox = {
    window: {}
  };
  vm.runInNewContext(source, sandbox, { filename: 'account-recovery.js' });
  return sandbox.window.AccountRecovery;
}

describe('account recovery helper', () => {
  before(async () => {
    source = await readFile(resolve(projectRoot, 'account-recovery.js'), 'utf8');
  });

  it('normalizes aliases and recovery emails', () => {
    const api = loadApi();

    assert.equal(api.normalizeAlias('Pilot'), 'pilot@3dvr');
    assert.equal(api.normalizeAlias('Pilot@3dvr.tech'), 'pilot@3dvr');
    assert.equal(api.normalizeAlias('pilot@example.com'), '');
    assert.equal(api.normalizeEmail(' Pilot@Example.com '), 'pilot@example.com');
    assert.equal(api.normalizeEmail('invalid-email'), '');
  });

  it('syncs and resolves aliases from recovery email index nodes', async () => {
    const api = loadApi();
    const tracker = createTrackingGun();
    const portalRoot = tracker.gun.get('3dvr-portal');

    const result = await api.syncRecoveryEmailIndex({
      portalRoot,
      alias: 'Pilot',
      email: 'Pilot@example.com',
      source: 'test',
      updatedBy: 'tester@3dvr',
      updatedAt: 100
    });

    assert.equal(result.saved, true);

    const lookup = await api.lookupAliasesByEmail({
      portalRoot,
      email: 'pilot@example.com'
    });

    assert.equal(lookup.latestAlias, 'pilot@3dvr');
    assert.deepEqual(Array.from(lookup.aliases), ['pilot@3dvr']);

    const resolved = await api.findAliasByRecoveryInput({
      portalRoot,
      input: 'pilot@example.com'
    });

    assert.equal(resolved.inputType, 'email');
    assert.equal(resolved.alias, 'pilot@3dvr');

    const indexRecord = tracker.store.get(
      '3dvr-portal/recoveryEmailIndex/pilot@example.com/pilot@3dvr'
    );
    assert.equal(indexRecord.email, 'pilot@example.com');
    assert.equal(indexRecord.alias, 'pilot@3dvr');
  });

  it('archives old alias records and points latest alias to replacement', async () => {
    const api = loadApi();
    const tracker = createTrackingGun();
    const portalRoot = tracker.gun.get('3dvr-portal');

    await api.syncRecoveryEmailIndex({
      portalRoot,
      alias: 'legacy@3dvr',
      email: 'member@example.com',
      updatedAt: 200
    });

    const archived = await api.archiveRecoveryAlias({
      portalRoot,
      alias: 'legacy@3dvr',
      email: 'member@example.com',
      recoveredTo: 'fresh@3dvr',
      updatedBy: 'admin@3dvr',
      updatedAt: 300
    });

    assert.equal(archived.saved, true);

    const latest = tracker.store.get('3dvr-portal/recoveryEmailLatest/member@example.com');
    assert.equal(latest.alias, 'fresh@3dvr');

    const archivedRecord = tracker.store.get(
      '3dvr-portal/recoveryEmailIndex/member@example.com/legacy@3dvr'
    );
    assert.equal(archivedRecord.archived, true);
    assert.equal(archivedRecord.recoveredTo, 'fresh@3dvr');
  });
});

import { describe, it, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

function createLocalStorage() {
  const store = new Map();
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };
}

function createMemoryGraph(initial = {}) {
  const values = new Map(Object.entries(initial));
  const listeners = new Map();

  function makeNode(parts = []) {
    const key = parts.join('/');
    return {
      get(name) {
        return makeNode([...parts, String(name)]);
      },
      put(value, callback) {
        values.set(key, value);
        for (const listener of listeners.get(key) || []) {
          listener(value);
        }
        setTimeout(() => callback?.({ ok: 1 }), 0);
        return this;
      },
      once(callback) {
        setTimeout(() => callback(values.get(key)), 0);
        return this;
      },
      on(callback) {
        const set = listeners.get(key) || new Set();
        set.add(callback);
        listeners.set(key, set);
        if (values.has(key)) {
          setTimeout(() => callback(values.get(key)), 0);
        }
        return this;
      },
      off() {
        listeners.delete(key);
      }
    };
  }

  return {
    root: makeNode([]),
    values
  };
}

function createSignedInScoreContext(localStorage, {
  cached = 0,
  aliasPoints,
  pubPoints
} = {}) {
  const alias = 'tmsteph@3dvr';
  const pub = 'pub-test';
  localStorage.setItem('signedIn', 'true');
  localStorage.setItem('alias', alias);
  localStorage.setItem('username', 'tmsteph');
  localStorage.setItem('userPubKey', pub);
  localStorage.setItem(`3dvr:score:user:${alias}`, String(cached));

  const userGraph = createMemoryGraph();
  const portalInitial = {};
  if (typeof aliasPoints !== 'undefined') {
    portalInitial[`userStats/${alias}`] = {
      alias,
      username: 'tmsteph',
      points: aliasPoints
    };
  }
  if (typeof pubPoints !== 'undefined') {
    portalInitial[`userStatsByPub/${pub}`] = {
      alias,
      username: 'tmsteph',
      pub,
      points: pubPoints
    };
  }
  const portalGraph = createMemoryGraph(portalInitial);
  const user = {
    ...userGraph.root,
    is: { pub },
    _: { sea: { priv: 'test' } },
    recall() {}
  };

  return {
    alias,
    pub,
    user,
    portalRoot: portalGraph.root,
    portalValues: portalGraph.values
  };
}

describe('score manager adjustments', () => {
  let ScoreSystem;
  let localStorage;
  let sandbox;

  before(async () => {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const projectRoot = resolve(__dirname, '..');
    const scoreSource = await readFile(resolve(projectRoot, 'score.js'), 'utf8');

    localStorage = createLocalStorage();
    sandbox = {
      console,
      setTimeout,
      clearTimeout,
      localStorage,
      window: null,
    };
    sandbox.window = {
      localStorage,
      addEventListener: () => {},
      removeEventListener: () => {},
      setTimeout,
      clearTimeout,
      console,
    };

    vm.runInNewContext(scoreSource, sandbox, { filename: 'score.js' });
    ScoreSystem = sandbox.window.ScoreSystem;
  });

  beforeEach(() => {
    localStorage.clear();
    if (ScoreSystem && typeof ScoreSystem.resetManager === 'function') {
      ScoreSystem.resetManager();
    }
  });

  it('backfills missing shared alias and pub points from the highest cached score', async () => {
    const context = createSignedInScoreContext(localStorage, { cached: 10338 });
    const manager = ScoreSystem.getManager({
      gun: {},
      user: context.user,
      portalRoot: context.portalRoot
    });

    await manager.whenReady();
    await new Promise(resolve => setTimeout(resolve, 25));

    assert.equal(manager.getCurrent(), 10338);
    assert.equal(
      context.portalValues.get(`userStats/${context.alias}`)?.points,
      10338
    );
    assert.equal(
      context.portalValues.get(`userStatsByPub/${context.pub}`)?.points,
      10338
    );
  });

  it('adopts a higher shared score instead of overwriting it with stale local cache', async () => {
    const context = createSignedInScoreContext(localStorage, {
      cached: 10338,
      aliasPoints: 12000,
      pubPoints: 12000
    });
    const manager = ScoreSystem.getManager({
      gun: {},
      user: context.user,
      portalRoot: context.portalRoot
    });

    await manager.whenReady();
    await new Promise(resolve => setTimeout(resolve, 25));

    assert.equal(manager.getCurrent(), 12000);
    assert.equal(
      context.portalValues.get(`userStats/${context.alias}`)?.points,
      12000
    );
    assert.equal(
      context.portalValues.get(`userStatsByPub/${context.pub}`)?.points,
      12000
    );
  });

  it('decrements score without going below zero', () => {
    const manager = ScoreSystem.getManager({ gun: null });
    manager.set(20);

    manager.decrement(5);
    assert.equal(manager.getCurrent(), 15);

    manager.decrement(40);
    assert.equal(manager.getCurrent(), 0);
  });

  it('caps decrements using provided floor and maxDrop', () => {
    const manager = ScoreSystem.getManager({ gun: null });
    manager.set(50);

    manager.decrement(20, { maxDrop: 6, floor: 10 });
    assert.equal(manager.getCurrent(), 44);

    manager.decrement(100, { floor: 40 });
    assert.equal(manager.getCurrent(), 40);

    manager.decrement(10, { floor: 60 });
    assert.equal(manager.getCurrent(), 40);
  });
});

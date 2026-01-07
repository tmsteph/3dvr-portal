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

  it('classifies auth errors for session clearing', () => {
    assert.equal(
      ScoreSystem.shouldPreserveSessionOnAuthError('Network timeout while connecting'),
      true
    );
    assert.equal(
      ScoreSystem.shouldClearSessionOnAuthError('Wrong user or password.'),
      false
    );
    assert.equal(
      ScoreSystem.shouldClearSessionOnAuthError('Invalid user.'),
      true
    );
    assert.equal(
      ScoreSystem.shouldClearSessionOnAuthError('Gun relay unavailable'),
      false
    );
  });
});

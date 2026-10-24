import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const navbarSource = readFileSync(new URL('../navbar.js', import.meta.url), 'utf8');
const accountSource = readFileSync(new URL('../operator/account.js', import.meta.url), 'utf8');

function setup(values = {}) {
  class Element {
    constructor() { this.children = []; this.attributes = {}; this.listeners = {}; this.dataset = {}; }
    appendChild(child) { this.children.push(child); return child; }
    replaceChildren(...children) { this.children = children; }
    setAttribute(key, value) { this.attributes[key] = value; }
    addEventListener(key, callback) { this.listeners[key] = callback; }
    focus() { this.focused = true; }
  }
  const mount = new Element();
  mount.dataset.signOutHref = '/operator/';
  const storage = new Map(Object.entries(values));
  const localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) };
  let scoreListener;
  let left = false;
  let resets = 0;
  let reloads = 0;
  const user = { recall() {}, leave() { left = true; }, get() { return { on() {} }; } };
  const gun = { user: () => user, get() { return { get() { return { get() { return { on() {} }; } }; } }; } };
  const window = {
    location: { pathname: '/operator/', search: '?task=123', hash: '#chat', hostname: 'portal.3dvr.tech', reload() { reloads++; } },
    listeners: {}, addEventListener(key, callback) { this.listeners[key] = callback; },
    localStorage,
    AuthIdentity: { syncStorageFromSharedIdentity() {} },
    Gun: () => gun,
    ScoreSystem: {
      ensureGun: factory => ({ gun: factory(), user }),
      recallUserSession() {},
      ensureGuestIdentity: () => 'guest-1',
      getManager: () => ({ getCurrent: () => 42, subscribe(callback) { scoreListener = callback; } }),
      resetManager() { resets++; }
    }
  };
  const document = {
    head: new Element(), body: new Element(), cookie: '',
    querySelector: selector => selector === '[data-account-navbar]' ? mount : null,
    querySelectorAll: () => [], getElementById: () => null,
    createElement: () => new Element(), addEventListener() {}
  };
  const context = vm.createContext({ window, document, localStorage, console, AbortController });
  vm.runInContext(accountSource, context);
  // In a browser, properties assigned to window are also global bindings.
  context.gun = window.gun;
  context.user = window.user;
  vm.runInContext(navbarSource, context);
  window.listeners.load();
  const nav = mount.children[0];
  const stats = nav.children[0];
  const menu = nav.children[1];
  const action = menu.children.at(-1);
  return { window, mount, nav, stats, menu, action, storage, document, user,
    updateScore: value => scoreListener(value),
    state: () => ({ left, resets, reloads }) };
}

test('Operator mounts the shared account menu with username and live score', () => {
  const app = setup({ signedIn: 'true', alias: 'tmsteph@3dvr', username: 'Thomas' });
  assert.equal(app.window.user, app.user);
  assert.equal(app.stats.children[0].innerText, '👤 Thomas');
  assert.equal(app.stats.children[1].innerText, '⭐ 42');
  app.updateScore(77);
  assert.equal(app.stats.children[1].innerText, '⭐ 77');
  app.stats.listeners.click();
  assert.equal(app.menu.hidden, false);
  app.nav.listeners.keydown({ key: 'Escape' });
  assert.equal(app.menu.hidden, true);
  assert.equal(app.stats.focused, true);
});

test('signed-out and guest users can sign in and return to the exact Operator view', () => {
  for (const values of [{}, { guest: 'true', guestId: 'guest-1' }]) {
    const app = setup(values);
    assert.equal(app.action.innerText, 'Sign in');
    app.action.listeners.click();
    assert.equal(app.window.location.href, '/sign-in.html?redirect=%2Foperator%2F%3Ftask%3D123%23chat');
    assert.equal(app.state().left, false);
  }
});

test('Operator sign-out clears identity and returns to Operator', () => {
  const app = setup({ signedIn: 'true', alias: 'tmsteph@3dvr', username: 'Thomas', password: 'test' });
  app.action.listeners.click();
  assert.equal(app.window.location.href, '/operator/');
  assert.equal(app.storage.has('signedIn'), false);
  assert.equal(app.storage.has('password'), false);
  assert.equal(app.state().left, true);
  assert.equal(app.state().resets, 1);
});

test('account changes in another tab reinitialize Operator; unrelated storage does not', () => {
  const app = setup();
  app.window.listeners.storage({ key: 'draft' });
  assert.equal(app.state().reloads, 0);
  app.window.listeners.storage({ key: 'signedIn' });
  assert.equal(app.state().reloads, 1);
});

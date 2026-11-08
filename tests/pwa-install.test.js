import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../pwa-install.js', import.meta.url), 'utf8');

// The shared install pattern for every 3DVR app surface: the button exists
// only while the browser holds a deferred install prompt, clicking it fires
// that prompt, and there is no instructions fallback anywhere.
function setup({ standalone = false, config, withServiceWorker = false, storage, relatedApps } = {}) {
  const windowEvents = {};
  const classes = new Set();
  let hiddenAttr = true;
  let clickHandler;
  const button = {
    disabled: false,
    addEventListener: (type, handler) => { clickHandler = handler; }
  };
  const banner = {
    classList: {
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name)
    },
    setAttribute: (name) => { if (name === 'hidden') hiddenAttr = true; },
    removeAttribute: (name) => { if (name === 'hidden') hiddenAttr = false; },
    querySelector: () => button
  };
  let registered = null;
  const store = storage || new Map();
  const navigatorObj = {};
  if (relatedApps) {
    navigatorObj.getInstalledRelatedApps = async () => relatedApps;
  }
  if (withServiceWorker) {
    navigatorObj.serviceWorker = {
      addEventListener: () => {},
      getRegistration: async () => undefined,
      register: async (url, options) => {
        registered = { url, options };
        return { addEventListener: () => {}, waiting: null, active: null };
      }
    };
  }
  const windowObj = {
    addEventListener: (type, handler) => { windowEvents[type] = handler; },
    matchMedia: () => ({ matches: standalone }),
    navigator: navigatorObj,
    location: { origin: 'https://ladies.3dvr.tech', pathname: '/3dvr-girl/' },
    __pwaInstallConfig: config
  };
  vm.runInNewContext(source, {
    window: windowObj,
    document: {
      currentScript: { dataset: {} },
      referrer: '',
      visibilityState: 'visible',
      querySelector: (selector) => (selector === '[data-install-banner]' ? banner : null)
    },
    navigator: navigatorObj,
    localStorage: {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => { store.set(key, String(value)); }
    },
    sessionStorage: { getItem: () => null, setItem: () => {} },
    console,
    URL,
    setTimeout
  });
  return {
    events: windowEvents,
    click: () => clickHandler(),
    visible: () => !hiddenAttr && !classes.has('is-hidden'),
    registered: () => registered
  };
}

function installEvent(outcome, counter) {
  return {
    preventDefault() {},
    prompt: async () => { counter.prompts += 1; },
    userChoice: Promise.resolve({ outcome })
  };
}

test('the button stays hidden until the browser offers an install prompt', () => {
  const ui = setup();
  assert.equal(ui.visible(), false);
});

test('clicking fires the native prompt once; dismissal hides the button until a fresh offer', async () => {
  const ui = setup();
  const counter = { prompts: 0 };
  ui.events.beforeinstallprompt(installEvent('dismissed', counter));
  assert.equal(ui.visible(), true);
  await ui.click();
  assert.equal(counter.prompts, 1);
  assert.equal(ui.visible(), false);
  await ui.click();
  assert.equal(counter.prompts, 1);
  ui.events.beforeinstallprompt(installEvent('dismissed', counter));
  assert.equal(ui.visible(), true);
  await ui.click();
  assert.equal(counter.prompts, 2);
});

test('acceptance and the appinstalled event keep the button hidden', async () => {
  const ui = setup();
  const counter = { prompts: 0 };
  ui.events.beforeinstallprompt(installEvent('accepted', counter));
  await ui.click();
  assert.equal(counter.prompts, 1);
  assert.equal(ui.visible(), false);
  ui.events.appinstalled();
  assert.equal(ui.visible(), false);
});

test('no button is shown inside the installed app', () => {
  const ui = setup({ standalone: true });
  const counter = { prompts: 0 };
  ui.events.beforeinstallprompt(installEvent('accepted', counter));
  assert.equal(ui.visible(), false);
});

test('the helper has no instructions fallback', () => {
  assert.ok(!source.includes('showModal'));
});

test('a page-level per-origin worker config wins over the defaults', async () => {
  const ui = setup({
    withServiceWorker: true,
    config: { swUrl: '/3dvr-girl/service-worker.js', swScope: '/3dvr-girl/' }
  });
  await new Promise((resolve) => setTimeout(resolve, 10));
  const registration = ui.registered();
  assert.equal(registration.url, '/3dvr-girl/service-worker.js');
  assert.equal(registration.options.scope, '/3dvr-girl/');
});

test('an install is remembered on later tab visits', async () => {
  const storage = new Map();
  const first = setup({ storage });
  const counter = { prompts: 0 };
  first.events.beforeinstallprompt(installEvent('accepted', counter));
  assert.equal(first.visible(), true);
  first.events.appinstalled();
  assert.equal(first.visible(), false);

  const later = setup({ storage });
  later.events.beforeinstallprompt(installEvent('accepted', counter));
  assert.equal(later.visible(), false);
});

test('accepting the prompt remembers the install for later visits', async () => {
  const storage = new Map();
  const first = setup({ storage });
  const counter = { prompts: 0 };
  first.events.beforeinstallprompt(installEvent('accepted', counter));
  await first.click();
  assert.equal(counter.prompts, 1);

  const later = setup({ storage });
  later.events.beforeinstallprompt(installEvent('accepted', counter));
  assert.equal(later.visible(), false);
});

test('dismissing the prompt does not mark the app installed', async () => {
  const storage = new Map();
  const first = setup({ storage });
  const counter = { prompts: 0 };
  first.events.beforeinstallprompt(installEvent('dismissed', counter));
  await first.click();
  assert.equal(first.visible(), false);

  const later = setup({ storage });
  later.events.beforeinstallprompt(installEvent('dismissed', counter));
  assert.equal(later.visible(), true);
});

test('a platform-reported installed related app suppresses the banner', async () => {
  const storage = new Map();
  const ui = setup({
    storage,
    relatedApps: [{ platform: 'webapp', url: 'https://helm.3dvr.tech/helm/helm.webmanifest' }]
  });
  const counter = { prompts: 0 };
  ui.events.beforeinstallprompt(installEvent('accepted', counter));
  assert.equal(ui.visible(), true);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(ui.visible(), false);

  const later = setup({ storage });
  later.events.beforeinstallprompt(installEvent('accepted', counter));
  assert.equal(later.visible(), false);
});

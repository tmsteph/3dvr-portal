import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../pwa-install.js', import.meta.url), 'utf8');

const HELPER_VERSION = '2026-11-07-footer1';

// The shared install pattern for every 3DVR app surface: installing is a
// plain link in the page footer, at the end of the page. The link exists
// in the markup from the start but stays hidden until the browser holds
// a deferred install prompt for an app that is not installed yet;
// clicking it fires that prompt. Nothing floats, overlays, or interrupts,
// and there is no instructions fallback anywhere.
function makeLink() {
  const handlers = {};
  let hidden = true;
  return {
    setAttribute(name) { if (name === 'hidden') hidden = true; },
    removeAttribute(name) { if (name === 'hidden') hidden = false; },
    addEventListener(type, handler) { handlers[type] = handler; },
    isHidden: () => hidden,
    click: () => (handlers.click ? handlers.click({ preventDefault() {} }) : undefined)
  };
}

function setup({ standalone = false, config, withServiceWorker = false, storage, relatedApps } = {}) {
  const windowEvents = {};
  const link = makeLink();
  let createdElements = 0;
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
    location: { origin: 'https://ladies.3dvr.tech', pathname: '/3dvr-girl/', href: 'https://ladies.3dvr.tech/3dvr-girl/' },
    __pwaInstallConfig: config
  };
  vm.runInNewContext(source, {
    window: windowObj,
    document: {
      currentScript: { dataset: {} },
      referrer: '',
      visibilityState: 'visible',
      querySelector: (selector) => (selector === '[data-install-link]' ? link : null),
      createElement: () => { createdElements += 1; return {}; }
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
    click: () => link.click(),
    visible: () => !link.isHidden(),
    registered: () => registered,
    store,
    createdElements: () => createdElements
  };
}

function installEvent(outcome, counter) {
  return {
    preventDefault() {},
    prompt: async () => { counter.prompts += 1; },
    userChoice: Promise.resolve({ outcome })
  };
}

test('the footer link stays hidden until the browser offers an install prompt', () => {
  const ui = setup();
  assert.equal(ui.visible(), false);
});

test('clicking the link fires the native prompt once; it hides until a fresh offer', async () => {
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

test('acceptance and the appinstalled event keep the link hidden', async () => {
  const ui = setup();
  const counter = { prompts: 0 };
  ui.events.beforeinstallprompt(installEvent('accepted', counter));
  await ui.click();
  assert.equal(counter.prompts, 1);
  assert.equal(ui.visible(), false);
  ui.events.appinstalled();
  assert.equal(ui.visible(), false);
});

test('no link is shown inside the installed app', () => {
  const ui = setup({ standalone: true });
  const counter = { prompts: 0 };
  ui.events.beforeinstallprompt(installEvent('accepted', counter));
  assert.equal(ui.visible(), false);
});

test('the helper has no instructions fallback', () => {
  assert.ok(!source.includes('showModal'));
});

test('the helper builds no floating element of its own', () => {
  const ui = setup();
  const counter = { prompts: 0 };
  ui.events.beforeinstallprompt(installEvent('accepted', counter));
  assert.equal(ui.visible(), true);
  assert.equal(ui.createdElements(), 0);
  assert.ok(!source.includes('data-install-banner'));
  assert.ok(!source.includes('data-install-button'));
  assert.ok(!source.includes('data-install-dismiss'));
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

test('dismissing the native prompt does not mark the app installed', async () => {
  const storage = new Map();
  const first = setup({ storage });
  const counter = { prompts: 0 };
  first.events.beforeinstallprompt(installEvent('dismissed', counter));
  await first.click();
  assert.equal(first.visible(), false);
  assert.notEqual(storage.get('3dvr-pwa-installed:/'), 'true');

  const later = setup({ storage });
  later.events.beforeinstallprompt(installEvent('dismissed', counter));
  assert.equal(later.visible(), true);
});

test('a platform-reported installed related app suppresses the link', async () => {
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

test('every helper copy wires the footer link and carries no banner or dismissal code', async () => {
  const copies = [
    '../pwa-install.js',
    '../calendar/pwa-install.js',
    '../contacts/pwa-install.js',
    '../crm/pwa-install.js'
  ];
  for (const copy of copies) {
    const text = await readFile(new URL(copy, import.meta.url), 'utf8');
    assert.ok(text.includes('data-install-link'), `${copy} wires the footer link`);
    assert.ok(!text.includes('data-install-banner'), `${copy} has no banner hook`);
    assert.ok(!text.includes('data-install-dismiss'), `${copy} has no dismiss control`);
    assert.ok(!text.includes('install-dismissed'), `${copy} keeps no dismissal memory`);
  }
});

test('the shared stylesheet styles a plain footer link, never a floating banner', async () => {
  const css = await readFile(new URL('../styles/install-link.css', import.meta.url), 'utf8');
  assert.ok(css.includes('Quiet install affordance'));
  assert.ok(css.includes('.install-footer'));
  assert.ok(css.includes('[data-install-link]'));
  assert.ok(!css.includes('.install-banner'));
  assert.ok(!css.includes('position: fixed'));
});

test('every app page carries the footer link and no banner markup', async () => {
  const pages = [
    '../helm/index.html',
    '../operator/index.html',
    '../3dvr-girl/index.html',
    '../3dvr-girl/character/index.html',
    '../calendar/index.html',
    '../contacts/index.html',
    '../crm/index.html',
    '../chat/index.html',
    '../notes/index.html',
    '../show-reset/index.html',
    '../seated-spine-reset/index.html'
  ];
  for (const page of pages) {
    const html = await readFile(new URL(page, import.meta.url), 'utf8');
    assert.ok(html.includes('data-install-link'), `${page} carries the footer install link`);
    assert.ok(!html.includes('data-install-banner'), `${page} has no install banner`);
    assert.ok(!html.includes('data-install-dismiss'), `${page} has no install dismiss control`);
  }
});

test('helper references are versioned and the root worker precaches the same version', async () => {
  const pages = ['../helm/index.html', '../calendar/index.html', '../contacts/index.html', '../crm/index.html'];
  for (const page of pages) {
    const html = await readFile(new URL(page, import.meta.url), 'utf8');
    assert.ok(html.includes(`pwa-install.js?v=${HELPER_VERSION}`), `${page} loads the versioned helper`);
  }
  const worker = await readFile(new URL('../service-worker.js', import.meta.url), 'utf8');
  assert.ok(worker.includes(`'/pwa-install.js?v=${HELPER_VERSION}'`), 'root worker precaches the versioned helper');
  assert.ok(worker.includes("'/styles/install-link.css'"), 'root worker precaches the footer-link stylesheet');
  assert.ok(worker.includes("CACHE_VERSION = 'v22'"), 'root worker cache version bumped');
});

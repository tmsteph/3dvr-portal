import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../pwa-install.js', import.meta.url), 'utf8');

const HELPER_VERSION = '2026-11-07-quiet1';
const DAY_MS = 24 * 60 * 60 * 1000;

// The shared install pattern for every 3DVR app surface: a small, quiet
// pill exists only while the browser holds a deferred install prompt,
// clicking it fires that prompt, there is no instructions fallback
// anywhere, and a discreet dismiss control silences the pill on this
// browser for a long while without claiming an install happened.
function makeElement() {
  const handlers = {};
  return {
    type: '',
    className: '',
    textContent: '',
    disabled: false,
    attrs: {},
    setAttribute(name, value) { this.attrs[name] = value; },
    addEventListener(type, handler) { handlers[type] = handler; },
    click: () => (handlers.click ? handlers.click() : undefined)
  };
}

function setup({ standalone = false, config, withServiceWorker = false, storage, relatedApps, shipDismiss = false, dismissKey } = {}) {
  const windowEvents = {};
  const classes = new Set();
  let hiddenAttr = true;
  const button = makeElement();
  const pageDismiss = shipDismiss ? makeElement() : null;
  const appended = [];
  const banner = {
    dataset: dismissKey ? { installDismissKey: dismissKey } : {},
    classList: {
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name)
    },
    setAttribute: (name) => { if (name === 'hidden') hiddenAttr = true; },
    removeAttribute: (name) => { if (name === 'hidden') hiddenAttr = false; },
    querySelector: (selector) => {
      if (selector === '[data-install-button]') return button;
      if (selector === '[data-install-dismiss]') {
        return pageDismiss
          || appended.find((el) => el.attrs['data-install-dismiss'] !== undefined)
          || null;
      }
      return null;
    },
    appendChild: (el) => { appended.push(el); }
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
    location: { origin: 'https://ladies.3dvr.tech', pathname: '/3dvr-girl/', href: 'https://ladies.3dvr.tech/3dvr-girl/' },
    __pwaInstallConfig: config
  };
  vm.runInNewContext(source, {
    window: windowObj,
    document: {
      currentScript: { dataset: {} },
      referrer: '',
      visibilityState: 'visible',
      querySelector: (selector) => (selector === '[data-install-banner]' ? banner : null),
      createElement: () => makeElement()
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
    click: () => button.click(),
    visible: () => !hiddenAttr && !classes.has('is-hidden'),
    registered: () => registered,
    store,
    appendedCount: () => appended.length,
    dismissControl: () => pageDismiss || appended[0] || null,
    clickDismiss: () => {
      const control = pageDismiss || appended[0];
      assert.ok(control, 'expected a dismiss control to exist');
      return control.click();
    }
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

test('the helper adds a quiet dismiss control when the page ships none', () => {
  const ui = setup();
  const counter = { prompts: 0 };
  ui.events.beforeinstallprompt(installEvent('accepted', counter));
  assert.equal(ui.visible(), true);
  const control = ui.dismissControl();
  assert.ok(control, 'expected the helper to add a dismiss control');
  assert.equal(control.className, 'install-banner__dismiss');
  assert.equal(control.textContent, '×');
  assert.equal(control.attrs['aria-label'], 'Dismiss install prompt');
});

test('dismissing with the × hides the banner and is remembered on later visits', () => {
  const storage = new Map();
  const first = setup({ storage });
  const counter = { prompts: 0 };
  first.events.beforeinstallprompt(installEvent('accepted', counter));
  assert.equal(first.visible(), true);
  first.clickDismiss();
  assert.equal(first.visible(), false);

  const later = setup({ storage });
  later.events.beforeinstallprompt(installEvent('accepted', counter));
  assert.equal(later.visible(), false);
});

test('a page-shipped dismiss control is used instead of adding one', () => {
  const ui = setup({ shipDismiss: true });
  const counter = { prompts: 0 };
  ui.events.beforeinstallprompt(installEvent('accepted', counter));
  assert.equal(ui.visible(), true);
  assert.equal(ui.appendedCount(), 0);
  ui.clickDismiss();
  assert.equal(ui.visible(), false);
});

test('a dismissal older than the 180-day horizon lets the banner return', () => {
  const storage = new Map();
  storage.set('3dvr-pwa-install-dismissed:/', String(Date.now() - 181 * DAY_MS));
  const ui = setup({ storage });
  const counter = { prompts: 0 };
  ui.events.beforeinstallprompt(installEvent('accepted', counter));
  assert.equal(ui.visible(), true);
});

test('a legacy permanent dismissal still counts', () => {
  const storage = new Map();
  storage.set('3dvr-pwa-install-dismissed:/', 'true');
  const ui = setup({ storage });
  const counter = { prompts: 0 };
  ui.events.beforeinstallprompt(installEvent('accepted', counter));
  assert.equal(ui.visible(), false);
});

test('a page-named dismissal key is honored', () => {
  const storage = new Map();
  storage.set('3dvr:crm-install-dismissed', String(Date.now()));
  const ui = setup({ storage, dismissKey: '3dvr:crm-install-dismissed' });
  const counter = { prompts: 0 };
  ui.events.beforeinstallprompt(installEvent('accepted', counter));
  assert.equal(ui.visible(), false);
});

test('dismissing does not mark the app installed', () => {
  const storage = new Map();
  const ui = setup({ storage });
  const counter = { prompts: 0 };
  ui.events.beforeinstallprompt(installEvent('accepted', counter));
  ui.clickDismiss();
  assert.notEqual(storage.get('3dvr-pwa-installed:/'), 'true');
  const dismissedAt = Number(storage.get('3dvr-pwa-install-dismissed:/'));
  assert.ok(dismissedAt > 0 && Date.now() - dismissedAt < DAY_MS);
});

test('every helper copy carries the dismissal wiring', async () => {
  const copies = [
    '../pwa-install.js',
    '../calendar/pwa-install.js',
    '../contacts/pwa-install.js',
    '../crm/pwa-install.js'
  ];
  for (const copy of copies) {
    const text = await readFile(new URL(copy, import.meta.url), 'utf8');
    assert.ok(text.includes('data-install-dismiss'), `${copy} wires a dismiss control`);
    assert.ok(text.includes('3dvr-pwa-install-dismissed'), `${copy} remembers dismissal per scope`);
    assert.ok(text.includes('install-banner__dismiss'), `${copy} uses the shared dismiss styling`);
  }
});

test('the shared stylesheet renders the banner as a quiet pill with a dismiss control', async () => {
  const css = await readFile(new URL('../styles/install-banner.css', import.meta.url), 'utf8');
  assert.ok(css.includes('Quiet install affordance'));
  assert.ok(css.includes('.install-banner__dismiss'));
  assert.ok(css.includes('border-radius: 999px'));
});

test('helper references are versioned and the root worker precaches the same version', async () => {
  const pages = ['../helm/index.html', '../calendar/index.html', '../contacts/index.html', '../crm/index.html'];
  for (const page of pages) {
    const html = await readFile(new URL(page, import.meta.url), 'utf8');
    assert.ok(html.includes(`pwa-install.js?v=${HELPER_VERSION}`), `${page} loads the versioned helper`);
  }
  const worker = await readFile(new URL('../service-worker.js', import.meta.url), 'utf8');
  assert.ok(worker.includes(`'/pwa-install.js?v=${HELPER_VERSION}'`), 'root worker precaches the versioned helper');
  assert.ok(worker.includes("CACHE_VERSION = 'v21'"), 'root worker cache version bumped');
});

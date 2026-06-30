import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createPlaywrightContext,
  launchBrowserForTest,
  resolvePlaywrightBrowser,
} from '../scripts/playwright/browser-targets.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');
const browserTarget = resolvePlaywrightBrowser(process.env.PLAYWRIGHT_BROWSER);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
};

const GUN_STUB_SOURCE = `
(() => {
  const store = new Map();
  const listeners = new Map();
  const authListeners = new Set();

  function clone(value) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
  }

  function keyFor(path) {
    return path.join('/');
  }

  function snapshotFor(path) {
    const key = keyFor(path);
    if (store.has(key)) {
      return clone(store.get(key));
    }

    const prefix = key ? key + '/' : '';
    const output = {};
    let found = false;

    for (const [storedKey, value] of store.entries()) {
      if (!storedKey.startsWith(prefix)) continue;
      const remainder = storedKey.slice(prefix.length);
      if (!remainder || remainder.includes('/')) continue;
      output[remainder] = clone(value);
      found = true;
    }

    return found ? output : undefined;
  }

  function notify(path) {
    const key = keyFor(path);
    const bucket = listeners.get(key) || [];
    const snapshot = snapshotFor(path);
    bucket.forEach((callback) => callback(snapshot));
  }

  function makeNode(path = []) {
    const node = {
      get(next) {
        return makeNode([...path, String(next)]);
      },
      put(value, callback) {
        store.set(keyFor(path), clone(value));
        notify(path);
        callback && callback({ ok: true });
        return node;
      },
      set(value, callback) {
        return node.put(value, callback);
      },
      once(callback) {
        callback && setTimeout(() => callback(snapshotFor(path)), 0);
        return node;
      },
      on(callback) {
        const key = keyFor(path);
        const bucket = listeners.get(key) || [];
        bucket.push(callback);
        listeners.set(key, bucket);
        callback && setTimeout(() => callback(snapshotFor(path)), 0);
        return { off() {} };
      },
      off() {},
      map() {
        return {
          on(callback) {
            const prefix = keyFor(path);
            for (const [storedKey, value] of store.entries()) {
              if (!storedKey.startsWith(prefix + '/')) continue;
              const remainder = storedKey.slice(prefix.length + 1);
              if (!remainder || remainder.includes('/')) continue;
              callback(clone(value), remainder);
            }
            return { off() {} };
          }
        };
      }
    };
    return node;
  }

  function createUser() {
    const userNode = makeNode(['~user']);
    const user = {
      ...userNode,
      is: null,
      _: { sea: null },
      recall() {
        const signedIn = window.localStorage.getItem('signedIn') === 'true';
        const storedAlias = String(window.localStorage.getItem('alias') || '').trim();
        const storedPub = String(window.localStorage.getItem('userPubKey') || '').trim();
        if (signedIn && storedPub) {
          user.is = { pub: storedPub, alias: storedAlias };
          user._ = { sea: { pub: storedPub } };
        }
      },
      auth(alias, _password, callback) {
        const normalizedAlias = String(alias || '').trim();
        const pub = 'pub_' + normalizedAlias.replace(/[^a-z0-9]+/gi, '_');
        user.is = { pub, alias: normalizedAlias };
        user._ = { sea: { pub } };
        window.setTimeout(() => {
          authListeners.forEach((listener) => listener());
          callback && callback({ ok: true, pub });
        }, 0);
      },
      create(alias, _password, callback) {
        const normalizedAlias = String(alias || '').trim();
        const pub = 'pub_' + normalizedAlias.replace(/[^a-z0-9]+/gi, '_');
        user.is = { pub, alias: normalizedAlias };
        user._ = { sea: { pub } };
        window.setTimeout(() => {
          callback && callback({ ok: true, pub });
        }, 0);
      },
      leave() {
        user.is = null;
        user._ = { sea: null };
      },
      on(eventName, callback) {
        if (eventName === 'auth' && typeof callback === 'function') {
          authListeners.add(callback);
        }
      }
    };
    return user;
  }

  window.Gun = function Gun() {
    const user = createUser();
    return {
      user() {
        return user;
      },
      get(key) {
        return makeNode([String(key)]);
      }
    };
  };

  window.Gun.SEA = {
    async sign(payload) {
      return JSON.stringify(payload);
    }
  };
  window.SEA = window.Gun.SEA;
})();
`;

async function installExternalRoutes(context) {
  await context.route('https://cdn.jsdelivr.net/npm/gun/gun.js', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/javascript; charset=utf-8',
      body: GUN_STUB_SOURCE
    });
  });

  await context.route('https://cdn.jsdelivr.net/npm/gun/sea.js', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/javascript; charset=utf-8',
      body: 'window.SEA = window.Gun && window.Gun.SEA ? window.Gun.SEA : {};'
    });
  });

  await context.route('https://cdn.jsdelivr.net/npm/gun/axe.js', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/javascript; charset=utf-8',
      body: ''
    });
  });

  await context.route('https://cdn.tailwindcss.com', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/javascript; charset=utf-8',
      body: 'window.tailwind = window.tailwind || {};',
    });
  });

  await context.route('**/_vercel/insights/script.js', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/javascript; charset=utf-8',
      body: '',
    });
  });

  await context.route('https://fav.farm/**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'image/svg+xml; charset=utf-8',
      body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"></svg>'
    });
  });
}

describe('contacts score integration', () => {
  let server;
  let baseUrl;

  before(async () => {
    server = createServer(async (req, res) => {
      try {
        const requestUrl = new URL(req.url, `http://${req.headers.host}`);
        let filePath = resolve(projectRoot, `.${requestUrl.pathname}`);
        if (requestUrl.pathname.endsWith('/')) {
          filePath = resolve(filePath, 'index.html');
        }
        const data = await readFile(filePath);
        const type = MIME_TYPES[extname(filePath).toLowerCase()] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': type });
        res.end(data);
      } catch (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not found');
      }
    });

    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    if (server) {
      await new Promise(resolve => server.close(resolve));
    }
  });

  it('updates the floating identity score when the score manager changes', async t => {
    const browser = await launchBrowserForTest(t, browserTarget);
    if (!browser) {
      return;
    }

    try {
      const context = await createPlaywrightContext(browser);
      await installExternalRoutes(context);
      const page = await context.newPage();
      await page.goto(`${baseUrl}/contacts/index.html`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#floatingIdentityScore');

      const initialScore = await page.textContent('#floatingIdentityScore');

      await page.evaluate(() => {
        const manager = window.ScoreSystem && window.ScoreSystem.getManager ? window.ScoreSystem.getManager() : null;
        if (manager) {
          manager.increment(7);
        }
      });

      await page.waitForFunction(() => {
        const el = document.getElementById('floatingIdentityScore');
        return el && /\b7\b/.test(el.textContent || '');
      });

      const updatedScore = await page.textContent('#floatingIdentityScore');
      assert.notStrictEqual(updatedScore, initialScore);
      assert.match(updatedScore, /\b7\b/);
    } finally {
      await browser.close();
    }
  });

  it('persists score across reloads', async t => {
    const browser = await launchBrowserForTest(t, browserTarget);
    if (!browser) {
      return;
    }

    try {
      const context = await createPlaywrightContext(browser);
      await installExternalRoutes(context);
      const page = await context.newPage();
      await page.goto(`${baseUrl}/contacts/index.html`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#floatingIdentityScore');
      await page.waitForFunction(() => {
        const manager = window.ScoreSystem && window.ScoreSystem.getManager
          ? window.ScoreSystem.getManager()
          : null;
        const mode = manager && typeof manager.getState === 'function'
          ? manager.getState().mode
          : null;
        return mode === 'guest' || mode === 'user';
      });

      const scoreBeforeCreate = await page.evaluate(() => {
        const manager = window.ScoreSystem && window.ScoreSystem.getManager
          ? window.ScoreSystem.getManager()
          : null;
        return manager && typeof manager.getCurrent === 'function'
          ? manager.getCurrent()
          : 0;
      });

      await page.click('#openCreateContact');
      await page.waitForSelector('#createContactOverlay:not(.hidden)');
      const createContactOverlay = page.locator('#createContactOverlay');
      await createContactOverlay.locator('#name').fill('Reload Test');
      await createContactOverlay.locator('#email').fill('reload@example.com');
      await createContactOverlay.locator('#company').fill('Persistence Inc');
      await createContactOverlay.locator('#contactForm button[type="submit"]').click();

      await page.waitForFunction(previousScore => {
        const manager = window.ScoreSystem && window.ScoreSystem.getManager
          ? window.ScoreSystem.getManager()
          : null;
        if (!manager || typeof manager.getCurrent !== 'function') return false;
        return manager.getCurrent() > previousScore;
      }, scoreBeforeCreate);

      const scoreAfterCreate = await page.evaluate(() => {
        const manager = window.ScoreSystem && window.ScoreSystem.getManager
          ? window.ScoreSystem.getManager()
          : null;
        return manager && typeof manager.getCurrent === 'function'
          ? manager.getCurrent()
          : 0;
      });
      assert.equal(scoreAfterCreate > scoreBeforeCreate, true);

      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(500);

      const managerScore = await page.evaluate(() => {
        return window.ScoreSystem && window.ScoreSystem.getManager
          ? window.ScoreSystem.getManager().getCurrent()
          : null;
      });
      assert.equal(managerScore, scoreAfterCreate);
    } finally {
      await browser.close();
    }
  });
});

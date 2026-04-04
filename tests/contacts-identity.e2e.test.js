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

let server;
let baseUrl;

describe('contacts identity flows', () => {
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

  async function launchChromium(t) {
    return launchBrowserForTest(t, browserTarget);
  }

  async function createContext(browser) {
    return createPlaywrightContext(browser);
  }

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
        body: 'window.tailwind = window.tailwind || {};'
      });
    });

    await context.route('**/_vercel/insights/script.js', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/javascript; charset=utf-8',
        body: ''
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

  it('shows stored signed-in identity even when the session is missing', async t => {
    const browser = await launchChromium(t);
    if (!browser) {
      return;
    }
    try {
      const context = await createContext(browser);
      await installExternalRoutes(context);
      await context.addInitScript(({ username, alias }) => {
        localStorage.setItem('signedIn', 'true');
        localStorage.setItem('username', username);
        localStorage.setItem('alias', alias);
        localStorage.removeItem('password');
        localStorage.removeItem('guest');
        localStorage.removeItem('guestId');
        localStorage.removeItem('guestDisplayName');
      }, { username: 'Agent Zero', alias: 'agent.zero@3dvr' });

      const page = await context.newPage();
      await page.goto(`${baseUrl}/contacts/index.html`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#userDisplay');

      const headerDisplay = (await page.textContent('#userDisplay')).trim();
      assert.match(headerDisplay, /Signed in as Agent Zero/i);

      await page.waitForFunction(() => {
        const el = document.getElementById('floatingIdentityName');
        return el && el.textContent && el.textContent.includes('Agent Zero');
      });

      const floatingDisplay = (await page.textContent('#floatingIdentityName')).trim();
      assert.equal(floatingDisplay, '👤 Agent Zero');
    } finally {
      await browser.close();
    }
  }, { timeout: 45000 });

  it('adopts sign-in changes written in another tab', async t => {
    const browser = await launchChromium(t);
    if (!browser) {
      return;
    }
    try {
      const context = await createContext(browser);
      await installExternalRoutes(context);
      const primary = await context.newPage();
      await primary.goto(`${baseUrl}/contacts/index.html`, { waitUntil: 'domcontentloaded' });
      await primary.waitForSelector('#floatingIdentityName');
      await primary.waitForFunction(() => {
        const el = document.getElementById('floatingIdentityName');
        return el && el.textContent && el.textContent.includes('Guest');
      });

      const secondary = await context.newPage();
      await secondary.goto(`${baseUrl}/sign-in.html`, { waitUntil: 'domcontentloaded' });
      await secondary.evaluate(({ username, alias }) => {
        localStorage.removeItem('guest');
        localStorage.setItem('alias', alias);
        localStorage.setItem('username', username);
        localStorage.setItem('signedIn', 'true');
      }, { username: 'Storage Signal', alias: 'storage.signal@3dvr' });
      await secondary.close();

      await primary.waitForFunction(expectedName => {
        const el = document.getElementById('floatingIdentityName');
        return el && el.textContent && el.textContent.includes(expectedName);
      }, {}, 'Storage Signal');

      const headerDisplay = (await primary.textContent('#userDisplay')).trim();
      assert.match(headerDisplay, /Signed in as Storage Signal/i);
    } finally {
      await browser.close();
    }
  }, { timeout: 45000 });

  it('allows signing in directly from the contacts app', async t => {
    const browser = await launchChromium(t);
    if (!browser) {
      return;
    }
    try {
      const context = await createContext(browser);
      await installExternalRoutes(context);
      const page = await context.newPage();
      const username = `contacts${Date.now()}`;
      const password = `Test!${Math.random().toString(36).slice(2, 8)}`;

      await page.goto(`${baseUrl}/contacts/index.html`, { waitUntil: 'domcontentloaded' });
      await page.click('#btnLogin');
      await page.fill('#authUsername', username);
      await page.fill('#authPassword', password);
      await page.click('#authForm button[type="submit"]');

      await page.waitForFunction(() => {
        const modal = document.getElementById('authModal');
        return modal && modal.classList.contains('hidden');
      }, null, { timeout: 45000 });
      await page.waitForSelector('#userDisplay');

      const headerDisplay = (await page.textContent('#userDisplay')).trim();
      assert.match(headerDisplay, new RegExp(`Signed in as ${username}`, 'i'));

      const storedIdentity = await page.evaluate(() => ({
        signedIn: localStorage.getItem('signedIn'),
        alias: localStorage.getItem('alias'),
        username: localStorage.getItem('username'),
        password: localStorage.getItem('password'),
      }));

      assert.equal(storedIdentity.signedIn, 'true');
      assert.equal(storedIdentity.username, username);
      assert.equal(storedIdentity.password, password);
      assert.match(storedIdentity.alias || '', new RegExp(`^${username}@3dvr$`, 'i'));
    } finally {
      await browser.close();
    }
  }, { timeout: 90000 });

  it('allows creating a new account through the sign-in flow', async t => {
    const browser = await launchChromium(t);
    if (!browser) {
      return;
    }
    try {
      const context = await createContext(browser);
      await installExternalRoutes(context);
      const page = await context.newPage();
      const username = `playwright${Date.now()}`;
      const password = `Test!${Math.random().toString(36).slice(2, 8)}`;

      await page.goto(`${baseUrl}/sign-in.html`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#username');
      await page.fill('#username', username);
      await page.fill('#password', password);

      await Promise.all([
        page.waitForURL('**/index.html', { timeout: 30000 }),
        page.click('button.primary-button'),
      ]);

      await page.goto(`${baseUrl}/contacts/index.html`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#userDisplay');

      const headerDisplay = (await page.textContent('#userDisplay')).trim();
      assert.match(headerDisplay, new RegExp(`Signed in as ${username}`, 'i'));

      await page.waitForFunction(expectedName => {
        const el = document.getElementById('floatingIdentityName');
        return el && el.textContent && el.textContent.includes(expectedName);
      }, {}, username);

      const floatingDisplay = (await page.textContent('#floatingIdentityName')).trim();
      assert.equal(floatingDisplay, `👤 ${username}`);
    } finally {
      await browser.close();
    }
  }, { timeout: 90000 });
});

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
  '.webmanifest': 'application/manifest+json'
};

const GUN_STUB_SOURCE = `
(() => {
  const store = new Map();
  const listeners = new Map();

  function clone(value) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
  }

  function hasArray(value) {
    if (Array.isArray(value)) return true;
    if (!value || typeof value !== 'object') return false;
    return Object.values(value).some(hasArray);
  }

  function keyFor(path) {
    return path.join('/');
  }

  function snapshotFor(path) {
    const key = keyFor(path);
    return store.has(key) ? clone(store.get(key)) : undefined;
  }

  function notify(path) {
    const key = keyFor(path);
    const bucket = listeners.get(key) || [];
    const snapshot = snapshotFor(path);
    bucket.forEach((callback) => callback(snapshot));
  }

  function makeNode(path = []) {
    return {
      get(next) {
        return makeNode([...path, String(next)]);
      },
      put(value, callback) {
        const key = keyFor(path);
        if (hasArray(value)) {
          callback && callback({ err: 'Invalid data: Array at ' + key });
          return this;
        }
        if (value === null) {
          store.delete(key);
        } else {
          store.set(key, clone(value));
        }
        notify(path);
        callback && callback({ ok: true });
        return this;
      },
      once(callback) {
        callback && callback(snapshotFor(path));
        return this;
      },
      on(callback) {
        const key = keyFor(path);
        const bucket = listeners.get(key) || [];
        bucket.push(callback);
        listeners.set(key, bucket);
        callback && callback(snapshotFor(path));
        return this;
      },
      map() {
        return {
          once(callback) {
            const prefix = keyFor(path);
            for (const [storedKey, value] of store.entries()) {
              if (!storedKey.startsWith(prefix + '/')) continue;
              const remainder = storedKey.slice(prefix.length + 1);
              if (!remainder || remainder.includes('/')) continue;
              callback(clone(value), remainder);
            }
            return this;
          },
          on(callback) {
            const prefix = keyFor(path);
            for (const [storedKey, value] of store.entries()) {
              if (!storedKey.startsWith(prefix + '/')) continue;
              const remainder = storedKey.slice(prefix.length + 1);
              if (!remainder || remainder.includes('/')) continue;
              callback(clone(value), remainder);
            }
            return this;
          }
        };
      }
    };
  }

  window.Gun = function Gun() {
    return {
      get(key) {
        return makeNode([String(key)]);
      },
      user() {
        return {
          is: null,
          _: { sea: null },
          recall() {},
          auth(alias, password, callback) {
            callback && callback({ ok: true });
          },
          on() {}
        };
      }
    };
  };

  window.__gunStoreSnapshot = function() {
    return Object.fromEntries(Array.from(store.entries()));
  };
})();
`;

let server;
let baseUrl;

async function launchBrowser(t) {
  return launchBrowserForTest(t, browserTarget);
}

async function createContext(browser) {
  return createPlaywrightContext(browser);
}

describe('sales training queue sync', () => {
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
      } catch {
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

  it('stores the shared queue in Gun-safe JSON and reloads it from Gun', async t => {
    const browser = await launchBrowser(t);
    if (!browser) {
      return;
    }

    try {
      const context = await createContext(browser);

      await context.route('https://cdn.jsdelivr.net/npm/gun/gun.js', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/javascript; charset=utf-8',
          body: GUN_STUB_SOURCE
        });
      });

      await context.route('**/_vercel/insights/script.js', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/javascript; charset=utf-8',
          body: ''
        });
      });

      const page = await context.newPage();
      const lead = `E2E Queue ${Date.now()}`;
      const message = 'Follow up with a concrete next step.';
      const next = 'Reply tomorrow at 10am';

      await page.goto(`${baseUrl}/sales/training/`, { waitUntil: 'networkidle' });
      await page.waitForSelector('[data-queue-form]');

      await page.fill('[data-queue-form] input[name="lead"]', lead);
      await page.fill('[data-queue-form] input[name="message"]', message);
      await page.fill('[data-queue-form] input[name="next"]', next);
      await page.click('[data-queue-form] button[type="submit"]');

      await page.waitForFunction(() => {
        const node = document.querySelector('[data-queue-sync-status]');
        return node && node.getAttribute('data-state') === 'ok';
      }, null, { timeout: 10000 });

      const syncStatus = (await page.textContent('[data-queue-sync-status]')).trim();
      assert.match(syncStatus, /Shared with Gun|Last synced/i);

      const storeSnapshot = await page.evaluate(() => window.__gunStoreSnapshot());
      const storedQueue = storeSnapshot['3dvr-portal/sales-training/today-queue'];

      assert.ok(storedQueue, 'expected the shared queue node to be written');
      assert.equal(typeof storedQueue.itemsJson, 'string');
      assert.equal(Array.isArray(storedQueue.items), false);

      const parsedQueue = JSON.parse(storedQueue.itemsJson);
      assert.ok(Array.isArray(parsedQueue), 'expected itemsJson to decode to an array');
      assert.ok(
        parsedQueue.some((item) => item.lead === lead && item.message === message && item.next === next),
        'expected the added queue item to be present in the Gun-safe payload'
      );

      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForFunction((expectedLead) => {
        return document.body.textContent && document.body.textContent.includes(expectedLead);
      }, lead, { timeout: 10000 });

      const reloadedStatus = (await page.textContent('[data-queue-sync-status]')).trim();
      assert.match(reloadedStatus, /Shared with Gun|Last synced/i);
    } finally {
      await browser.close();
    }
  }, { timeout: 45000 });
});

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
        const key = keyFor(path);
        if (value === null) {
          store.delete(key);
        } else {
          store.set(key, clone(value));
        }
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

async function installExternalRoutes(context) {
  await context.route('https://cdn.jsdelivr.net/npm/gun/gun.js', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/javascript; charset=utf-8',
      body: GUN_STUB_SOURCE,
    });
  });

  await context.route('https://cdn.jsdelivr.net/npm/gun/sea.js', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/javascript; charset=utf-8',
      body: 'window.SEA = window.Gun && window.Gun.SEA ? window.Gun.SEA : {};',
    });
  });

  await context.route('https://cdn.jsdelivr.net/npm/gun/axe.js', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/javascript; charset=utf-8',
      body: '',
    });
  });

  await context.route('https://cdn.tailwindcss.com', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/javascript; charset=utf-8',
      body: 'window.tailwind = window.tailwind || {};',
    });
  });

  await context.route('https://fonts.googleapis.com/**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'text/css; charset=utf-8',
      body: '',
    });
  });

  await context.route('https://fonts.gstatic.com/**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'font/woff2',
      body: '',
    });
  });

  await context.route('https://fav.farm/**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'image/svg+xml; charset=utf-8',
      body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"></svg>',
    });
  });

  await context.route('**/_vercel/insights/script.js', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/javascript; charset=utf-8',
      body: '',
    });
  });
}

describe('CRM and Contacts import stories', () => {
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

    await new Promise(resolvePromise => server.listen(0, '127.0.0.1', resolvePromise));
    const address = server.address();
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    if (server) {
      await new Promise(resolvePromise => server.close(resolvePromise));
    }
  });

  it('imports Android-picked contacts into Contacts and preserves source metadata', async t => {
    const browser = await launchBrowser(t);
    if (!browser) {
      return;
    }

    try {
      const context = await createContext(browser);
      await installExternalRoutes(context);
      await context.addInitScript(({ pickedContacts }) => {
        Object.defineProperty(window.navigator, 'contacts', {
          configurable: true,
          value: {
            async select() {
              return pickedContacts;
            },
          },
        });
      }, {
        pickedContacts: [{
          name: ['Morgan Device'],
          email: ['morgan@example.com'],
          tel: ['+1 (555) 000-0001'],
          organization: ['Device Studio'],
          title: ['Founder'],
        }],
      });

      const page = await context.newPage();
      await page.goto(`${baseUrl}/contacts/index.html`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#btnPickDeviceContacts');
      await page.click('#btnPickDeviceContacts');

      await page.waitForFunction(() => {
        const status = document.getElementById('contactsImportStatus');
        return status && /Imported 1 new and updated 0 existing contact from your phone\./.test(status.textContent || '');
      }, null, { timeout: 10000 });

      await page.waitForFunction(() => {
        return Array.from(document.querySelectorAll('#contactList .contact-card'))
          .some(card => (card.textContent || '').includes('Morgan Device'));
      }, null, { timeout: 10000 });

      const storedContact = await page.evaluate(() => {
        const snapshot = window.__gunStoreSnapshot ? window.__gunStoreSnapshot() : {};
        const match = Object.entries(snapshot).find(([key, value]) => {
          return key.startsWith('contacts-public/')
            && value
            && typeof value === 'object'
            && value.name === 'Morgan Device';
        });
        return match ? { key: match[0], value: match[1] } : null;
      });

      assert.ok(storedContact, 'expected imported contact to be written to the shared contacts node');
      assert.equal(storedContact.value.email, 'morgan@example.com');
      assert.equal(storedContact.value.source, 'Phone import');

      await page.locator('#contactList .contact-card').first().click();
      await page.waitForSelector('#contactDetailOverlay:not(.hidden)');
      const detailMeta = await page.textContent('#contactDetailMeta');
      assert.match(detailMeta || '', /Source\s+Phone import/);
    } finally {
      await browser.close();
    }
  }, { timeout: 90000 });

  it('imports iPhone vCards into CRM and opens the outreach-ready lead detail', async t => {
    const browser = await launchBrowser(t);
    if (!browser) {
      return;
    }

    try {
      const context = await createContext(browser);
      await installExternalRoutes(context);
      const page = await context.newPage();
      const vcard = [
        'BEGIN:VCARD',
        'VERSION:3.0',
        'N:Prospect;Taylor;;;',
        'item1.EMAIL;TYPE=INTERNET:taylor@example.com',
        'item1.TEL;TYPE=CELL:(555) 100-2000',
        'ORG:Prospect Studio',
        'TITLE:Founder',
        'NOTE:Knows Thomas from a referral.',
        'CATEGORIES:friend,builder',
        'END:VCARD',
      ].join('\n');

      await page.goto(`${baseUrl}/crm/index.html`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#crmPickDeviceContacts');
      await page.locator('#crmImportFile').setInputFiles({
        name: 'iphone.vcf',
        mimeType: 'text/vcard',
        buffer: Buffer.from(vcard),
      });

      await page.waitForFunction(() => {
        const status = document.getElementById('crmImportStatus');
        return status && /Imported 1 new and updated 0 existing lead from uploaded file\(s\)\./.test(status.textContent || '');
      }, null, { timeout: 10000 });

      await page.waitForFunction(() => {
        return Array.from(document.querySelectorAll('#contactList .crm-card'))
          .some(card => (card.textContent || '').includes('Taylor Prospect'));
      }, null, { timeout: 10000 });

      await page.waitForSelector('#crmDetailOverlay:not(.hidden)');
      await page.waitForFunction(() => {
        const name = document.getElementById('crmDetailName');
        const drafts = document.getElementById('crmDetailDrafts');
        return Boolean(
          name
          && drafts
          && (name.textContent || '').includes('Taylor Prospect')
          && /First message/.test(drafts.textContent || '')
        );
      }, null, { timeout: 10000 });

      const storedLead = await page.evaluate(() => {
        const snapshot = window.__gunStoreSnapshot ? window.__gunStoreSnapshot() : {};
        const match = Object.entries(snapshot).find(([key, value]) => {
          return key.startsWith('3dvr-crm/')
            && value
            && typeof value === 'object'
            && value.name === 'Taylor Prospect';
        });
        return match ? { key: match[0], value: match[1] } : null;
      });

      assert.ok(storedLead, 'expected imported lead to be written to the CRM node');
      assert.equal(storedLead.value.source, 'Phone import file');
      assert.equal(storedLead.value.status, 'Warm - Awareness');
      assert.equal(storedLead.value.warmth, 'warm');
      assert.equal(storedLead.value.nextBestAction, 'Review fit and draft the first outreach.');

      const detailMeta = await page.textContent('#crmDetailMeta');
      assert.match(detailMeta || '', /Warmth\s+Warm/);
      assert.match(detailMeta || '', /Next best action\s+Review fit and draft the first outreach\./);
    } finally {
      await browser.close();
    }
  }, { timeout: 90000 });
});

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');
const requestedBrowser = (process.env.PLAYWRIGHT_BROWSER || 'chromium').trim().toLowerCase();
const browserLaunchName = ['chromium', 'firefox', 'webkit'].includes(requestedBrowser)
  ? requestedBrowser
  : 'chromium';

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
let cachedBrowserType = null;

async function resolveBrowserType(t) {
  if (cachedBrowserType) {
    return cachedBrowserType;
  }

  try {
    const playwright = await import('playwright');
    const browserType = playwright[browserLaunchName];
    if (!browserType) {
      t.skip(`Playwright browser "${browserLaunchName}" is unavailable in this environment.`);
      return null;
    }
    cachedBrowserType = browserType;
    return cachedBrowserType;
  } catch (error) {
    const message = error && typeof error.message === 'string' ? error.message : String(error);
    if (message.includes('Unsupported platform')) {
      t.skip(`Playwright ${browserLaunchName} is not supported on this platform.`);
      return null;
    }
    throw error;
  }
}

async function launchBrowser(t) {
  const browserType = await resolveBrowserType(t);
  if (!browserType) {
    return null;
  }

  try {
    return await browserType.launch({ headless: true });
  } catch (error) {
    const message = error && typeof error.message === 'string' ? error.message : String(error);
    if (
      message.includes('dependencies to run browsers')
      || message.includes('Executable doesn\'t exist')
      || message.includes('Unsupported platform')
    ) {
      t.skip('Playwright browser dependencies are not installed in this environment.');
      return null;
    }
    throw error;
  }
}

async function createContext(browser) {
  try {
    return await browser.newContext({ serviceWorkers: 'block' });
  } catch (error) {
    const message = error && typeof error.message === 'string' ? error.message : String(error);
    if (message.includes('serviceWorkers')) {
      return browser.newContext();
    }
    throw error;
  }
}

async function installExternalRoutes(context) {
  await context.route('https://cdn.jsdelivr.net/npm/gun/gun.js', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/javascript; charset=utf-8',
      body: GUN_STUB_SOURCE
    });
  });

  await context.route('https://fonts.googleapis.com/**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'text/css; charset=utf-8',
      body: ''
    });
  });

  await context.route('https://fonts.gstatic.com/**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'font/woff2',
      body: ''
    });
  });

  await context.route('**/_vercel/insights/script.js', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/javascript; charset=utf-8',
      body: ''
    });
  });
}

describe('sales research interview scheduling flow', () => {
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

  it('schedules an interview, opens the calendar draft, and logs the outcome without retyping', async t => {
    const browser = await launchBrowser(t);
    if (!browser) {
      return;
    }

    try {
      const context = await createContext(browser);
      await installExternalRoutes(context);

      const page = await context.newPage();
      const company = `E2E Studio ${Date.now()}`;
      const contact = 'Alex Operator';
      const prepNote = 'Ask where follow-up stalls after the first inquiry.';
      const date = '2026-04-02';
      const time = '13:30';

      await page.goto(`${baseUrl}/sales/research.html`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#scheduleInterviewForm');

      await page.selectOption('#scheduleInterviewSegment', 'professional-services');
      await page.fill('#scheduleInterviewCompany', company);
      await page.fill('#scheduleInterviewContact', contact);
      await page.fill('#scheduleInterviewDate', date);
      await page.fill('#scheduleInterviewTime', time);
      await page.selectOption('#scheduleInterviewDuration', '20');
      await page.fill('#scheduleInterviewNote', prepNote);
      await page.click('#scheduleInterviewForm button[type="submit"]');

      await page.waitForFunction(expectedCompany => {
        const list = document.getElementById('scheduledInterviewList');
        return list && list.textContent && list.textContent.includes(expectedCompany);
      }, company, { timeout: 10000 });

      const scheduleSnapshot = await page.evaluate(() => window.__gunStoreSnapshot());
      const storedSchedule = scheduleSnapshot['3dvr-portal/sales-research/schedule'];
      assert.ok(storedSchedule, 'expected the scheduled interview node to be written');
      assert.equal(typeof storedSchedule.itemsJson, 'string');

      const parsedSchedule = JSON.parse(storedSchedule.itemsJson);
      assert.ok(Array.isArray(parsedSchedule), 'expected scheduled interviews to be stored as itemsJson');
      const scheduledEntry = parsedSchedule.find(item => item.company === company && item.contact === contact);
      assert.ok(scheduledEntry, 'expected the saved interview slot to be present');

      const calendarHref = await page.locator('#scheduledInterviewList a', { hasText: 'Open calendar draft' }).first().getAttribute('href');
      assert.ok(calendarHref, 'expected an interview calendar draft link');

      const calendarPage = await context.newPage();
      await calendarPage.goto(new URL(calendarHref, `${baseUrl}/sales/research.html`).href, { waitUntil: 'domcontentloaded' });
      await calendarPage.waitForFunction(() => {
        const container = document.querySelector('[data-create-event-container]');
        return container && !container.hidden;
      }, null, { timeout: 10000 });

      const calendarTitle = await calendarPage.inputValue('input[name="title"]');
      const calendarDescription = await calendarPage.inputValue('textarea[name="description"]');
      assert.match(calendarTitle, /Interview • Professional services •/);
      assert.match(calendarTitle, new RegExp(company.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      assert.match(calendarDescription, /Segment: Professional services/);
      assert.match(calendarDescription, new RegExp(prepNote.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      await calendarPage.close();

      await page.getByRole('button', { name: 'Log outcome' }).click();

      await page.waitForFunction(expectedCompany => {
        const companyField = document.getElementById('interviewCompany');
        const hiddenId = document.getElementById('interviewScheduledId');
        return companyField && companyField.value === expectedCompany && hiddenId && hiddenId.value;
      }, company, { timeout: 10000 });

      const prefilledNotes = await page.inputValue('#interviewNotes');
      assert.match(prefilledNotes, /Prep note:/);
      assert.match(prefilledNotes, new RegExp(prepNote.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

      await page.fill('#interviewNotes', `${prefilledNotes}\nThe buyer said quoting and follow-up are slipping between email and text.`);
      await page.click('#interviewLogForm button[type="submit"]');

      await page.waitForFunction(expectedCompany => {
        const logList = document.getElementById('interviewLogList');
        const scheduledList = document.getElementById('scheduledInterviewList');
        return logList
          && logList.textContent
          && logList.textContent.includes(expectedCompany)
          && scheduledList
          && !scheduledList.textContent.includes(expectedCompany);
      }, company, { timeout: 10000 });

      const finalSnapshot = await page.evaluate(() => window.__gunStoreSnapshot());
      const finalSchedule = JSON.parse(finalSnapshot['3dvr-portal/sales-research/schedule'].itemsJson);
      const finalInterviews = JSON.parse(finalSnapshot['3dvr-portal/sales-research/interviews'].itemsJson);

      assert.equal(
        finalSchedule.some(item => item.company === company),
        false,
        'expected the scheduled slot to be removed after logging the outcome'
      );
      assert.ok(
        finalInterviews.some(item => item.company === company && item.contact === contact && item.status === 'Interviewed'),
        'expected the logged interview outcome to be saved'
      );
    } finally {
      await browser.close();
    }
  }, { timeout: 90000 });
});

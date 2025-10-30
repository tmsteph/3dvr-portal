import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

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
    try {
      return await chromium.launch();
    } catch (error) {
      const message = error && typeof error.message === 'string' ? error.message : String(error);
      if (message.includes('dependencies to run browsers')) {
        t.skip('Playwright browser dependencies are not installed in this environment.');
        return null;
      }
      throw error;
    }
  }

  it('shows stored signed-in identity even when the session is missing', async t => {
    const browser = await launchChromium(t);
    if (!browser) {
      return;
    }
    try {
      const context = await browser.newContext();
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
      await page.goto(`${baseUrl}/contacts/index.html`, { waitUntil: 'networkidle' });
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

  it('allows creating a new account through the sign-in flow', async t => {
    const browser = await launchChromium(t);
    if (!browser) {
      return;
    }
    try {
      const context = await browser.newContext();
      const page = await context.newPage();
      const username = `playwright${Date.now()}`;
      const password = `Test!${Math.random().toString(36).slice(2, 8)}`;

      await page.goto(`${baseUrl}/sign-in.html`, { waitUntil: 'networkidle' });
      await page.fill('#username', username);
      await page.fill('#password', password);

      await Promise.all([
        page.waitForURL('**/index.html', { timeout: 30000 }),
        page.click('button.primary-button'),
      ]);

      await page.goto(`${baseUrl}/contacts/index.html`, { waitUntil: 'networkidle' });
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

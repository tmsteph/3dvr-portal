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

  async function launchChromium(t) {
    try {
      return await chromium.launch();
    } catch (error) {
      const message = error && typeof error.message === 'string' ? error.message : String(error);
      if (message.includes('dependencies to run browsers') || message.includes('Executable doesn\'t exist')) {
        t.skip('Playwright browser dependencies are not installed in this environment.');
        return null;
      }
      throw error;
    }
  }

  it('updates the floating identity score when the score manager changes', async t => {
    const browser = await launchChromium(t);
    if (!browser) {
      return;
    }

    try {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto(`${baseUrl}/contacts/index.html`, { waitUntil: 'networkidle' });
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
    const browser = await launchChromium(t);
    if (!browser) {
      return;
    }

    try {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto(`${baseUrl}/contacts/index.html`, { waitUntil: 'networkidle' });
      await page.waitForSelector('#floatingIdentityScore');

      await page.click('#openCreateContact');
      await page.fill('#name', 'Reload Test');
      await page.fill('#email', 'reload@example.com');
      await page.fill('#company', 'Persistence Inc');
      await page.click('#contactForm button[type="submit"]');

      await page.waitForFunction(() => {
        const el = document.getElementById('floatingIdentityScore');
        return el && /\b10\b/.test(el.textContent || '');
      });

      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForTimeout(500);

      const persistedScore = await page.textContent('#floatingIdentityScore');
      assert.match(persistedScore || '', /\b10\b/);

      const managerScore = await page.evaluate(() => {
        return window.ScoreSystem && window.ScoreSystem.getManager
          ? window.ScoreSystem.getManager().getCurrent()
          : null;
      });
      assert.equal(managerScore, 10);
    } finally {
      await browser.close();
    }
  });
});

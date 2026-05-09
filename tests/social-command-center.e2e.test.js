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

describe('social command center persistence', () => {
  before(async () => {
    server = createServer(async (req, res) => {
      try {
        const requestUrl = new URL(req.url, 'http://' + req.headers.host);
        let filePath = resolve(projectRoot, '.' + requestUrl.pathname);
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
    baseUrl = 'http://127.0.0.1:' + address.port;
  });

  after(async () => {
    if (server) {
      await new Promise(resolve => server.close(resolve));
    }
  });

  async function launchChromium(t) {
    try {
      return await chromium.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-gpu',
          '--disable-software-rasterizer',
          '--disable-dev-shm-usage',
          '--use-gl=swiftshader'
        ],
        env: {
          ...process.env,
          LIBGL_ALWAYS_SOFTWARE: '1'
        }
      });
    } catch (error) {
      const message = error && typeof error.message === 'string' ? error.message : String(error);
      if (message.includes('dependencies to run browsers')) {
        t.skip('Playwright browser dependencies are not installed in this environment.');
        return null;
      }
      throw error;
    }
  }

  async function ensureGunReady(page) {
    try {
      await page.waitForFunction(() => typeof window.Gun === 'function', { timeout: 10000 });
    } catch (err) {
      throw new Error('Gun failed to load in the browser. Check CDN access or bundle Gun locally for tests.');
    }
  }

  async function waitForRelay(page) {
    try {
      await page.waitForFunction(() => {
        const status = window.__GUN_STATUS__ && window.__GUN_STATUS__['social-media'];
        if (!status || !status.connected) return false;
        const peer = status.lastPeer || '';
        if (!peer || typeof peer !== 'string') return false;
        if (peer.includes('127.0.0.1') || peer.includes('localhost')) return false;
        return peer.startsWith('wss://');
      }, { timeout: 5000 });
      return true;
    } catch (err) {
      return false;
    }
  }

  async function createCampaign(page, name) {
    await page.fill('#campaignName', name);
    await page.fill('#campaignPlatform', 'Instagram');
    await page.fill('#campaignObjective', 'Drive sign-ups');
    await page.click('#campaignForm button.primary-action');

    await page.waitForFunction(() => {
      const field = document.getElementById('campaignName');
      return field && field.value === '';
    }, { timeout: 5000 });

    const deadline = Date.now() + 10000;
    let titles = [];
    while (Date.now() < deadline) {
      titles = await page.evaluate(() => (
        Array.from(document.querySelectorAll('[data-role=campaignTitle]'))
          .map(el => (el.textContent || '').trim())
      ));
      if (titles.some(title => title.includes(name))) {
        return;
      }
      await page.waitForTimeout(250);
    }
    throw new Error(`Campaign did not render: ${name}. Titles: ${JSON.stringify(titles)}`);
  }

  async function deleteCampaignByName(page, name) {
    await page.evaluate(expectedName => {
      const cards = Array.from(document.querySelectorAll('.campaign-card'));
      const target = cards.find(card => {
        const title = card.querySelector('[data-role=campaignTitle]');
        return title && (title.textContent || '').includes(expectedName);
      });
      if (!target) return false;
      const deleteButton = target.querySelector('[data-action=delete-campaign]');
      if (deleteButton) {
        deleteButton.click();
        return true;
      }
      return false;
    }, name);
  }

  it('keeps campaigns across page reloads', async t => {
    const browser = await launchChromium(t);
    if (!browser) return;

    const campaignName = 'PW Campaign ' + Date.now();
    try {
      const context = await browser.newContext();
      const page = await context.newPage();
      page.on('console', msg => {
        if (msg.type() === 'error') {
          console.error('[browser console]', msg.text());
        }
      });
      page.on('pageerror', err => {
        console.error('[page error]', err);
      });
      await page.goto(baseUrl + '/social/command-center.html', { waitUntil: 'networkidle' });
      await ensureGunReady(page);

      await createCampaign(page, campaignName);
      await page.reload({ waitUntil: 'networkidle' });
      await ensureGunReady(page);

      const deadline = Date.now() + 10000;
      let titles = [];
      while (Date.now() < deadline) {
        titles = await page.evaluate(() => (
          Array.from(document.querySelectorAll('[data-role=campaignTitle]'))
            .map(el => (el.textContent || '').trim())
        ));
        if (titles.some(title => title.includes(campaignName))) {
          break;
        }
        await page.waitForTimeout(250);
      }
      if (!titles.some(title => title.includes(campaignName))) {
        throw new Error(`Campaign missing after reload: ${campaignName}. Titles: ${JSON.stringify(titles)}`);
      }

      await deleteCampaignByName(page, campaignName);
    } finally {
      await browser.close();
    }
  }, { timeout: 60000 });

  it('keeps campaigns across new browser contexts when relay storage is available', async t => {
    const browser = await launchChromium(t);
    if (!browser) return;

    const campaignName = 'PW Relay ' + Date.now();
    try {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto(baseUrl + '/social/command-center.html', { waitUntil: 'networkidle' });
      await ensureGunReady(page);
      const relayReady = await waitForRelay(page);
      if (!relayReady) {
        t.skip('Gun relay not connected; cross-browser persistence cannot be verified in this environment.');
        return;
      }

      await createCampaign(page, campaignName);
      await context.close();

      const newContext = await browser.newContext();
      const newPage = await newContext.newPage();
      await newPage.goto(baseUrl + '/social/command-center.html', { waitUntil: 'networkidle' });
      await ensureGunReady(newPage);

      const deadline = Date.now() + 15000;
      let titles = [];
      while (Date.now() < deadline) {
        titles = await newPage.evaluate(() => (
          Array.from(document.querySelectorAll('[data-role=campaignTitle]'))
            .map(el => (el.textContent || '').trim())
        ));
        if (titles.some(title => title.includes(campaignName))) {
          break;
        }
        await newPage.waitForTimeout(250);
      }
      if (!titles.some(title => title.includes(campaignName))) {
        throw new Error(`Campaign missing in new context: ${campaignName}. Titles: ${JSON.stringify(titles)}`);
      }

      await deleteCampaignByName(newPage, campaignName);
      await newContext.close();
    } finally {
      await browser.close();
    }
  }, { timeout: 90000 });
});

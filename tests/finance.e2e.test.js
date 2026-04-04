import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
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
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

const MOCK_STRIPE_METRICS = {
  available: { USD: 18245 },
  pending: { USD: 0 },
  recurringRevenue: { USD: 30000 },
  activeSubscribers: 3,
  planCounts: { builder: 1, embedded: 1, pro: 1 },
  hasMoreSubscribers: false,
};
const unavailableMetricLabel = '\u2014';

describe('finance live stripe metrics', () => {
  let server;
  let baseUrl;

  before(async () => {
    server = createServer(async (req, res) => {
      try {
        const requestUrl = new URL(req.url, `http://${req.headers.host}`);

        if (requestUrl.pathname === '/api/stripe/metrics') {
          res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify(MOCK_STRIPE_METRICS));
          return;
        }

        if (requestUrl.pathname === '/api/stripe/events') {
          res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ events: [], hasWebhookSecret: false }));
          return;
        }

        let filePath = resolve(projectRoot, `.${requestUrl.pathname}`);
        if (requestUrl.pathname.endsWith('/')) {
          filePath = resolve(filePath, 'index.html');
        }

        const data = await readFile(filePath);
        const type = MIME_TYPES[extname(filePath).toLowerCase()] || 'application/octet-stream';
        res.writeHead(200, { 'content-type': type });
        res.end(data);
      } catch (error) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('Not found');
      }
    });

    await new Promise(resolveServer => server.listen(0, '127.0.0.1', resolveServer));
    const address = server.address();
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    if (server) {
      await new Promise(resolveServer => server.close(resolveServer));
    }
  });

  it('keeps live Stripe totals visible on the finance overview when cross-origin requests are blocked', async t => {
    const browser = await launchBrowserForTest(t, browserTarget);
    if (!browser) {
      return;
    }

    try {
      const context = await createPlaywrightContext(browser);
      const page = await context.newPage();
      await page.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.hostname !== '127.0.0.1') {
          return route.abort('blockedbyclient');
        }
        return route.continue();
      });

      await page.goto(`${baseUrl}/finance/index.html`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => {
        return document.getElementById('stripe-overview-balance')?.textContent?.trim() === '$182.45'
          && document.getElementById('stripe-overview-subscribers')?.textContent?.trim() === '3'
          && document.getElementById('stripe-overview-mrr')?.textContent?.trim() === '$300.00';
      });
      await page.waitForTimeout(4500);

      const snapshot = await page.evaluate(() => ({
        overviewBalance: document.getElementById('stripe-overview-balance')?.textContent?.trim() || null,
        overviewSubscribers: document.getElementById('stripe-overview-subscribers')?.textContent?.trim() || null,
        overviewMrr: document.getElementById('stripe-overview-mrr')?.textContent?.trim() || null,
        linkedPaid: document.getElementById('profitability-linked-paid')?.textContent?.trim() || null,
        linkedMrr: document.getElementById('profitability-mrr')?.textContent?.trim() || null,
        status: document.getElementById('profitability-status')?.textContent?.trim() || null,
      }));

      assert.equal(snapshot.overviewBalance, '$182.45');
      assert.equal(snapshot.overviewSubscribers, '3');
      assert.equal(snapshot.overviewMrr, '$300.00');
      assert.equal(snapshot.linkedPaid, unavailableMetricLabel);
      assert.equal(snapshot.linkedMrr, unavailableMetricLabel);
      assert.match(
        snapshot.status,
        /Live Stripe totals are current(?:, but portal billing links are unavailable in this browser right now\. Active subscribers and live Stripe MRR are current; linked-account diagnostics are not\.|\. Portal billing links are still syncing, so linked-account diagnostics may be incomplete\.)/
      );
    } finally {
      await browser.close();
    }
  });

  it('shows live Stripe balance, subscribers, and MRR on the Stripe workspace', async t => {
    const browser = await launchBrowserForTest(t, browserTarget);
    if (!browser) {
      return;
    }

    try {
      const context = await createPlaywrightContext(browser);
      const page = await context.newPage();
      await page.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.hostname !== '127.0.0.1') {
          return route.abort('blockedbyclient');
        }
        return route.continue();
      });

      await page.goto(`${baseUrl}/finance/stripe.html`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => {
        return document.getElementById('stripe-live-balance')?.textContent?.trim() === '$182.45'
          && document.getElementById('stripe-live-subscribers')?.textContent?.trim() === '3'
          && document.getElementById('stripe-live-mrr')?.textContent?.trim() === '$300.00';
      });

      const snapshot = await page.evaluate(() => ({
        balance: document.getElementById('stripe-live-balance')?.textContent?.trim() || null,
        subscribers: document.getElementById('stripe-live-subscribers')?.textContent?.trim() || null,
        mrr: document.getElementById('stripe-live-mrr')?.textContent?.trim() || null,
      }));

      assert.deepEqual(snapshot, {
        balance: '$182.45',
        subscribers: '3',
        mrr: '$300.00',
      });
    } finally {
      await browser.close();
    }
  });
});

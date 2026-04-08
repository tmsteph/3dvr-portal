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
const MOCK_STRIPE_CASHFLOW = {
  updatedAt: '2026-04-08T03:00:00.000Z',
  detailLimit: 2,
  summary: {
    transactionCount: 4,
    inflow: { USD: 185245 },
    outflow: { USD: 48200 },
    fees: { USD: 645 },
    net: { USD: 136400 },
    payouts: { USD: 42000 },
    payins: { USD: 5000 },
    financingIn: { USD: 150000 },
    financingOut: { USD: 6200 },
    updatedAt: '2026-04-08T03:00:00.000Z',
    isTruncated: false,
    detailLimit: 2,
    summaryLimit: 5000,
  },
  transactions: [
    {
      id: 'txn_charge',
      createdAt: '2026-04-08T01:00:00.000Z',
      availableOn: '2026-04-08T01:30:00.000Z',
      currency: 'USD',
      amount: 30245,
      fee: 645,
      net: 29600,
      type: 'charge',
      typeLabel: 'Charge',
      reportingCategory: 'charge',
      reportingLabel: 'Charge',
      status: 'available',
      sourceId: 'ch_123',
      sourceObject: 'charge',
      label: 'Portal User',
      detail: 'user@example.com • Invoice in_123 • Card • Charge ch_123',
      description: 'Builder subscription',
      counterpartyType: 'customer',
      customerId: 'cus_123',
      customerName: 'Portal User',
      customerEmail: 'user@example.com',
      group: 'customer_payment',
      groupLabel: 'Customer payment',
      direction: 'inflow',
    },
    {
      id: 'txn_financing',
      createdAt: '2026-04-08T00:30:00.000Z',
      availableOn: '2026-04-08T00:45:00.000Z',
      currency: 'USD',
      amount: -6200,
      fee: 0,
      net: -6200,
      type: 'anticipation_repayment',
      typeLabel: 'Anticipation Repayment',
      reportingCategory: 'adjustment',
      reportingLabel: 'Adjustment',
      status: 'available',
      sourceId: 'src_financing',
      sourceObject: '',
      label: 'Stripe Capital repayment',
      detail: 'Source src_financing',
      description: 'Stripe Capital repayment',
      counterpartyType: '',
      customerId: '',
      customerName: '',
      customerEmail: '',
      group: 'financing',
      groupLabel: 'Financing',
      direction: 'outflow',
    }
  ]
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

        if (requestUrl.pathname === '/api/stripe/cashflow') {
          res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify(MOCK_STRIPE_CASHFLOW));
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
          && document.getElementById('stripe-overview-mrr')?.textContent?.trim() === '$300.00'
          && document.getElementById('stripe-cashflow-inflow')?.textContent?.trim() === '$1,852.45'
          && document.getElementById('stripe-cashflow-outflow')?.textContent?.trim() === '$482.00';
      });
      await page.waitForTimeout(4500);

      const snapshot = await page.evaluate(() => ({
        overviewBalance: document.getElementById('stripe-overview-balance')?.textContent?.trim() || null,
        overviewSubscribers: document.getElementById('stripe-overview-subscribers')?.textContent?.trim() || null,
        overviewMrr: document.getElementById('stripe-overview-mrr')?.textContent?.trim() || null,
        cashflowIn: document.getElementById('stripe-cashflow-inflow')?.textContent?.trim() || null,
        cashflowOut: document.getElementById('stripe-cashflow-outflow')?.textContent?.trim() || null,
        cashflowFees: document.getElementById('stripe-cashflow-fees')?.textContent?.trim() || null,
        cashflowNet: document.getElementById('stripe-cashflow-net')?.textContent?.trim() || null,
        linkedPaid: document.getElementById('profitability-linked-paid')?.textContent?.trim() || null,
        linkedMrr: document.getElementById('profitability-mrr')?.textContent?.trim() || null,
        status: document.getElementById('profitability-status')?.textContent?.trim() || null,
      }));

      assert.equal(snapshot.overviewBalance, '$182.45');
      assert.equal(snapshot.overviewSubscribers, '3');
      assert.equal(snapshot.overviewMrr, '$300.00');
      assert.equal(snapshot.cashflowIn, '$1,852.45');
      assert.equal(snapshot.cashflowOut, '$482.00');
      assert.equal(snapshot.cashflowFees, '$6.45');
      assert.equal(snapshot.cashflowNet, '$1,364.00');
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
          && document.getElementById('stripe-live-mrr')?.textContent?.trim() === '$300.00'
          && document.getElementById('stripe-cashflow-financing-out')?.textContent?.trim() === '$62.00';
      });

      const snapshot = await page.evaluate(() => ({
        balance: document.getElementById('stripe-live-balance')?.textContent?.trim() || null,
        subscribers: document.getElementById('stripe-live-subscribers')?.textContent?.trim() || null,
        mrr: document.getElementById('stripe-live-mrr')?.textContent?.trim() || null,
        payouts: document.getElementById('stripe-cashflow-payouts')?.textContent?.trim() || null,
        payins: document.getElementById('stripe-cashflow-payins')?.textContent?.trim() || null,
        financingIn: document.getElementById('stripe-cashflow-financing-in')?.textContent?.trim() || null,
        financingOut: document.getElementById('stripe-cashflow-financing-out')?.textContent?.trim() || null,
        cashflowList: document.getElementById('stripe-cashflow-list')?.textContent?.trim() || null,
      }));

      assert.deepEqual(snapshot, {
        balance: '$182.45',
        subscribers: '3',
        mrr: '$300.00',
        payouts: '$420.00',
        payins: '$50.00',
        financingIn: '$1,500.00',
        financingOut: '$62.00',
        cashflowList: snapshot.cashflowList,
      });
      assert.ok(snapshot.cashflowList);
      assert.match(snapshot.cashflowList, /Portal User/);
      assert.match(snapshot.cashflowList, /Stripe Capital repayment/);
    } finally {
      await browser.close();
    }
  });

  it('fits the finance pages within a narrow mobile viewport without horizontal overflow', async t => {
    const browser = await launchBrowserForTest(t, browserTarget);
    if (!browser) {
      return;
    }

    try {
      const context = await browser.newContext({
        serviceWorkers: 'block',
        viewport: { width: 360, height: 780 },
        isMobile: true,
        deviceScaleFactor: 2,
      });
      const page = await context.newPage();
      await page.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.hostname !== '127.0.0.1') {
          return route.abort('blockedbyclient');
        }
        return route.continue();
      });

      for (const pathname of ['/finance/index.html', '/finance/stripe.html']) {
        await page.goto(`${baseUrl}${pathname}`, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => {
          return document.getElementById('stripe-cashflow-status')?.textContent?.trim().length > 0;
        });

        const dimensions = await page.evaluate(() => ({
          innerWidth: window.innerWidth,
          bodyScrollWidth: document.body.scrollWidth,
          docScrollWidth: document.documentElement.scrollWidth,
        }));

        assert.ok(
          dimensions.bodyScrollWidth <= dimensions.innerWidth + 1,
          `body overflowed mobile viewport on ${pathname}`
        );
        assert.ok(
          dimensions.docScrollWidth <= dimensions.innerWidth + 1,
          `document overflowed mobile viewport on ${pathname}`
        );
      }
    } finally {
      await browser.close();
    }
  });
});

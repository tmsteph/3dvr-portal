import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const baseDir = new URL('../', import.meta.url);

async function read(relativePath) {
  return readFile(new URL(relativePath, baseDir), 'utf8');
}

describe('app billing sync', () => {
  it('cache-busts the workbench and builder bundles after the live billing sync patch', async () => {
    const openaiHtml = await read('openai-app/index.html');
    const webBuilderHtml = await read('web-builder-app/index.html');

    assert.match(openaiHtml, /<script[^>]+src="app\.js\?v=20260323-live-billing-sync"/);
    assert.match(webBuilderHtml, /<script[^>]+type="module"[^>]+src="app\.js\?v=20260323-live-billing-sync"/);
  });

  it('refreshes live Stripe billing status in the OpenAI workbench app', async () => {
    const js = await read('openai-app/app.js');

    assert.ok(js.includes("const billingEmailStorageKey = 'portal-billing-email';"));
    assert.ok(js.includes("const billingStatusCacheStorageKey = 'portal-billing-status-cache';"));
    assert.ok(js.includes("scope: 'stripe-billing'"));
    assert.ok(js.includes("fetch('/api/stripe/status'"));
    assert.ok(js.includes('syncBillingStatusFromStripe'));
    assert.ok(js.includes('restoreStoredBillingAuth'));
    assert.ok(js.includes("source: 'stripe-status-sync'"));
    assert.ok(js.includes('hydrateCachedBillingStatus'));
    assert.ok(js.includes("billingTierNode.get(livePub).put(tierRecord)"));
  });

  it('refreshes live Stripe billing status in the web builder app', async () => {
    const js = await read('web-builder-app/app.js');

    assert.ok(js.includes('const user = gun.user();'));
    assert.ok(js.includes("const billingEmailStorageKey = 'portal-billing-email';"));
    assert.ok(js.includes("const billingStatusCacheStorageKey = 'portal-billing-status-cache';"));
    assert.ok(js.includes("scope: 'stripe-billing'"));
    assert.ok(js.includes("fetch('/api/stripe/status'"));
    assert.ok(js.includes('syncBillingStatusFromStripe'));
    assert.ok(js.includes('restoreStoredBillingAuth'));
    assert.ok(js.includes("source: 'stripe-status-sync'"));
    assert.ok(js.includes("user.on('auth', () => {"));
    assert.ok(js.includes('hydrateCachedBillingStatus'));
  });
});

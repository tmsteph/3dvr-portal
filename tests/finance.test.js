import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';

const baseDir = new URL('../finance/', import.meta.url);

async function fileExists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch (error) {
    return false;
  }
}

describe('finance ledger hub', () => {
  it('includes an index page wired to the finance script and Gun node', async () => {
    const indexUrl = new URL('index.html', baseDir);
    assert.equal(await fileExists(indexUrl), true, 'index.html should exist');

    const html = await readFile(indexUrl, 'utf8');
    assert.match(html, /3dvr Finance/);
    assert.match(html, /id="finance-summary"/);
    assert.match(html, /Profitability alignment/);
    assert.match(html, /id="profitability-status"/);
    assert.match(html, /id="profitability-stripe-subscribers"/);
    assert.match(html, /id="profitability-live-mrr"/);
    assert.match(html, /id="profitability-linked-paid"/);
    assert.match(html, /id="profitability-builder-count"/);
    assert.match(html, /id="profitability-embedded-count"/);
    assert.match(html, /id="profitability-mrr"/);
    assert.match(html, /id="profitability-link-gap"/);
    assert.match(html, /id="stripe-overview-mrr"/);
    assert.match(html, /id="profitability-sync-meta"/);
    assert.match(html, /id="profitability-refresh-totals"/);
    assert.match(html, /id="profitability-refresh-customers"/);
    assert.match(html, /Open profitability desk/);
    assert.match(html, /id="finance-ledger"/);
    assert.match(html, /href="\.\/incoming\.html"/);
    assert.match(html, /href="\.\/outgoing\.html"/);
    assert.match(html, /<link[^>]+href="\.\/styles.css"/);
    assert.match(html, /<script[^>]+src="https:\/\/cdn\.jsdelivr\.net\/npm\/gun\/gun\.js"/);
    assert.match(html, /<script[^>]+src="https:\/\/cdn\.jsdelivr\.net\/npm\/gun\/sea\.js"/);
    assert.match(html, /<script[^>]+src="https:\/\/cdn\.jsdelivr\.net\/npm\/gun\/axe\.js"/);
    assert.match(html, /<script[^>]+src="\.\.\/score.js"/);
    assert.match(html, /<script[^>]+src="\.\/app.js"/);
  });

  it('ships a stylesheet tailored for the finance layout', async () => {
    const stylesUrl = new URL('styles.css', baseDir);
    assert.equal(await fileExists(stylesUrl), true, 'styles.css should exist');

    const css = await readFile(stylesUrl, 'utf8');
    assert.match(css, /\.finance-shell/);
    assert.match(css, /\.finance-ledger/);
    assert.match(css, /\.finance-card/);
  });

  it('includes the Stripe workspace with live recurring revenue metrics', async () => {
    const stripeUrl = new URL('stripe.html', baseDir);
    assert.equal(await fileExists(stripeUrl), true, 'stripe.html should exist');

    const html = await readFile(stripeUrl, 'utf8');
    assert.match(html, /Stripe workspace/);
    assert.match(html, /Live Stripe MRR/);
    assert.match(html, /id="stripe-live-mrr"/);
    assert.match(html, /id="stripe-live-subscribers"/);
    assert.match(html, /id="stripe-live-balance"/);
  });

  it('persists entries to portal and legacy finance Gun graphs with documented structure', async () => {
    const scriptUrl = new URL('app.js', baseDir);
    assert.equal(await fileExists(scriptUrl), true, 'app.js should exist');

    const js = await readFile(scriptUrl, 'utf8');
    assert.match(js, /const peers = window\.__GUN_PEERS__ \|\| \[/);
    assert.ok(js.includes("gun.get('3dvr-portal')"));
    assert.ok(js.includes("portalRoot.get('finance')"));
    assert.ok(js.includes("portalRoot.get('billing')"));
    assert.ok(js.includes("gun.get('finance')"));
    assert.ok(js.includes("financeRoot.get('stripeCustomers')"));
    assert.match(js, /financeRoot\.get\('expenditures'\)/);
    assert.match(js, /legacyFinanceRoot\.get\('expenditures'\)/);
    assert.match(js, /billingRoot\.get\('usageTier'\)/);
    assert.match(js, /summarizeLinkedBilling/);
    assert.match(js, /estimateRecurringRevenue/);
    assert.match(js, /stripeMetricsState = \{/);
    assert.match(js, /recurringRevenue: \{\}/);
    assert.match(js, /formatSyncTimestamp/);
    assert.match(js, /syncStripeCustomerSummaries/);
    assert.match(js, /renderProfitabilitySummary/);
    assert.match(js, /refreshProfitabilityStripeCustomers/);
    assert.match(js, /writeRecordToSources\(/);
    assert.match(js, /form\.addEventListener\('submit'/);
    assert.match(js, /Gun\.text\.random/);
  });

  it('registers the finance workspace in the portal app grid', async () => {
    const portalIndex = new URL('../index.html', baseDir);
    assert.equal(await fileExists(portalIndex), true, 'root index.html should exist');

    const html = await readFile(portalIndex, 'utf8');
    const financeIndex = html.indexOf('>Finance<');
    const gamesIndex = html.indexOf('>Games<');
    assert.ok(financeIndex !== -1, 'Finance app card should be listed on the portal');
    assert.ok(gamesIndex !== -1, 'Games app card should still be present');
    assert.ok(financeIndex < gamesIndex, 'Finance card should appear before Games to keep alphabetical order');
    assert.match(html, /href="finance\/(?:index\.html)?"/);
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';

const baseDir = new URL('../billing/', import.meta.url);

async function fileExists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch (error) {
    return false;
  }
}

describe('billing center', () => {
  it('ships the billing page with plan actions and Gun-powered billing controls', async () => {
    const indexUrl = new URL('index.html', baseDir);
    assert.equal(await fileExists(indexUrl), true, 'billing/index.html should exist');

    const html = await readFile(indexUrl, 'utf8');
    assert.match(html, /Billing Center/);
    assert.match(html, /Open start flow/);
    assert.match(html, /New Customer Fast Path/);
    assert.match(html, /Use the start flow if you want the clearest\s+first step/);
    assert.match(html, /New customers can use the start flow first,\s+then return/);
    assert.match(html, /id="billing-email"/);
    assert.match(html, /id="manage-billing"[^>]+disabled[^>]+aria-disabled="true"/);
    assert.match(html, /Manage in Stripe/);
    assert.match(html, /id="cancel-subscription"[^>]+button--danger[^>]+disabled[^>]+aria-disabled="true"/);
    assert.match(html, /Cancel renewal/);
    assert.match(html, /Cancel renewal opens Stripe's cancellation\s+confirmation/);
    assert.match(html, /You do not need to choose a free plan first/);
    assert.match(html, /Find your passions, organize your life, and get into the portal without a card\./);
    assert.match(html, /data-plan-action="starter"/);
    assert.match(html, /data-plan-action="pro"/);
    assert.match(html, /data-plan-action="builder"/);
    assert.match(html, /data-plan-action="embedded"/);
    assert.match(html, /\$200<span>\/mo<\/span>/);
    assert.match(html, /Live/);
    assert.match(html, /Live monthly billing for the Builder lane is now available\./);
    assert.match(html, /Live monthly billing for the Embedded lane is now available\./);
    assert.match(html, /Choose \$50/);
    assert.match(html, /Choose \$200/);
    assert.match(html, /Use Start for the quickest route/);
    assert.match(html, /id="custom-submit"/);
    assert.match(html, /Already paying through Stripe\?/);
    assert.match(html, /rel="preload"[^>]+as="style"/);
    assert.match(html, /fonts\.googleapis\.com[^>]+media="print"[^>]+onload="this\.media='all'"/);
    assert.match(html, /<script[^>]+defer[^>]+src="https:\/\/cdn\.jsdelivr\.net\/npm\/gun\/gun\.js"/);
    assert.match(html, /<script[^>]+defer[^>]+src="https:\/\/cdn\.jsdelivr\.net\/npm\/gun\/sea\.js"/);
    assert.match(html, /<script[^>]+defer[^>]+src="\/gun-init\.js"/);
    assert.match(html, /<script[^>]+src="\.\/app\.js\?v=20260408-customer-journey"/);
    const embeddedIndex = html.indexOf('data-plan-card="embedded"');
    const embeddedActionIndex = html.indexOf('data-plan-action="embedded"');
    const builderIndex = html.indexOf('data-plan-card="builder"');
    const builderActionIndex = html.indexOf('data-plan-action="builder"');
    const proIndex = html.indexOf('data-plan-card="pro"');
    const starterIndex = html.indexOf('data-plan-card="starter"');
    const freeIndex = html.indexOf('data-plan-card="free"');
    assert.ok(embeddedIndex !== -1 || embeddedActionIndex !== -1, 'Embedded $200 plan card should be present');
    assert.ok(builderIndex !== -1, 'Builder plan card should be present');
    assert.ok(embeddedActionIndex !== -1, 'Embedded $200 plan should be self-serve');
    assert.ok(builderActionIndex !== -1, 'Builder plan should be self-serve');
    assert.ok(proIndex !== -1, 'Pro plan card should be present');
    assert.ok(starterIndex !== -1, 'Starter plan card should be present');
    assert.ok(freeIndex !== -1, 'Free plan card should be present');
    assert.ok(proIndex < starterIndex, 'Pro should render before Starter');
    assert.ok(starterIndex < freeIndex, 'Starter should render before Free');
    assert.ok(freeIndex < builderIndex, 'Free should render before Builder');
    assert.ok(builderIndex < embeddedIndex || embeddedIndex === -1, 'Builder should render before Embedded');
  });

  it('registers billing in the portal app grid', async () => {
    const portalIndex = new URL('../index.html', baseDir);
    assert.equal(await fileExists(portalIndex), true, 'root index.html should exist');

    const html = await readFile(portalIndex, 'utf8');
    const billingIndex = html.indexOf('>Billing<');
    const financeIndex = html.indexOf('>Finance<');
    assert.ok(billingIndex !== -1, 'Billing app card should be listed on the portal');
    assert.ok(financeIndex !== -1, 'Finance app card should still be present');
    assert.ok(billingIndex < financeIndex, 'Billing card should appear before Finance to keep alphabetical order');
    assert.match(html, /href="billing\/(?:index\.html)?"/);
  });

  it('stores account-linked billing hints in the billing app script', async () => {
    const appUrl = new URL('app.js', baseDir);
    assert.equal(await fileExists(appUrl), true, 'billing/app.js should exist');

    const js = await readFile(appUrl, 'utf8');
    assert.ok(js.includes("billingRoot.get('customersByAlias')"));
    assert.ok(js.includes("billingRoot.get('customersByPub')"));
    assert.ok(js.includes("const billingEmailsStorageKey = 'portal-billing-emails'"));
    assert.ok(js.includes("const billingStatusCacheStorageKey = 'portal-billing-status-cache'"));
    assert.ok(js.includes('billingEmails = normalizeBillingEmailList(record.billingEmails, record.emails, record.email)'));
    assert.ok(js.includes('billingEmails: associatedBillingEmails('));
    assert.ok(js.includes("usageTierNode.get(state.pub).put"));
    assert.ok(js.includes("fetch('/api/stripe/checkout'"));
    assert.ok(js.includes("fetchJson('/api/stripe/checkout'"));
    assert.ok(js.includes("fetchJson('/api/stripe/status'"));
    assert.ok(js.includes("Gun.SEA.sign({"));
    assert.ok(js.includes('authProof'));
    assert.ok(js.includes('forceReauth = false'));
    assert.ok(js.includes('user?._?.sea?.pub || user?.is?.pub'));
    assert.ok(js.includes('waitForBillingSessionReady'));
    assert.ok(js.includes('hydrateStoredAccountState'));
    assert.ok(js.includes('readStoredBillingStatus'));
    assert.ok(js.includes('cacheBillingStatus'));
    assert.ok(js.includes('refreshLiveBillingBootstrap'));
    assert.ok(js.includes('recoverBillingAuthSession'));
    assert.ok(js.includes("Refresh account to continue with Stripe billing on this tab."));
    assert.ok(js.includes('Legacy Stripe plan found:'));
    assert.ok(js.includes('older Stripe subscription was found for this billing email'));
    assert.ok(js.includes('Older Stripe billing history was found for this billing email'));
    assert.ok(js.includes("Manage subscription"));
    assert.ok(js.includes("View billing history"));
    assert.ok(js.includes('Review one subscription'));
    assert.ok(js.includes('Manage billing opens one record at a time.'));
    assert.ok(js.includes('Choose the plan you want to keep'));
    assert.ok(js.includes('older paid plans will be canceled automatically'));
    assert.ok(js.includes('Recovered and linked from an older Stripe record.'));
    assert.ok(js.includes('We linked your older Stripe billing record to this portal account automatically.'));
    assert.ok(js.includes('Stop $5 billing'));
    assert.ok(js.includes('You do not need to choose Free first'));
    assert.ok(js.includes("action: 'cancel'"));
    assert.ok(js.includes("params.get('manage') === 'cancelled'"));
    assert.ok(js.includes('secure plan-change flow'));
    assert.ok(js.includes("label = 'Refresh account first'"));
    assert.ok(js.includes('authPub: livePub'));
    assert.ok(js.includes("window.location.assign(signInHref(targetPlan))"));
    assert.ok(!js.includes('cancel the extra plan'));
    assert.ok(!js.includes("label = 'Review duplicates'"));
  });
});

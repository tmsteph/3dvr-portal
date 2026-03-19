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
    assert.match(html, /id="billing-email"/);
    assert.match(html, /id="manage-billing"[^>]+disabled[^>]+aria-disabled="true"/);
    assert.match(html, /Manage in Stripe/);
    assert.match(html, /id="cancel-subscription"[^>]+button--danger[^>]+disabled[^>]+aria-disabled="true"/);
    assert.match(html, /Cancel renewal/);
    assert.match(html, /Cancel renewal opens Stripe's cancellation\s+confirmation/);
    assert.match(html, /You do not need to choose a free plan first/);
    assert.match(html, /data-plan-action="starter"/);
    assert.match(html, /data-plan-action="pro"/);
    assert.match(html, /data-plan-action="builder"/);
    assert.match(html, /id="custom-submit"/);
    assert.match(html, /Already paying through Stripe\?/);
    assert.match(html, /<script[^>]+src="https:\/\/cdn\.jsdelivr\.net\/npm\/gun\/gun\.js"/);
    assert.match(html, /<script[^>]+src="\.\/app\.js"/);
  });

  it('stores account-linked billing hints in the billing app script', async () => {
    const appUrl = new URL('app.js', baseDir);
    assert.equal(await fileExists(appUrl), true, 'billing/app.js should exist');

    const js = await readFile(appUrl, 'utf8');
    assert.ok(js.includes("billingRoot.get('customersByAlias')"));
    assert.ok(js.includes("billingRoot.get('customersByPub')"));
    assert.ok(js.includes("usageTierNode.get(state.pub).put"));
    assert.ok(js.includes("fetch('/api/stripe/checkout'"));
    assert.ok(js.includes("fetchJson('/api/stripe/checkout'"));
    assert.ok(js.includes("fetchJson('/api/stripe/status'"));
    assert.ok(js.includes("Gun.SEA.sign({"));
    assert.ok(js.includes('authProof'));
    assert.ok(js.includes('forceReauth = false'));
    assert.ok(js.includes('user?._?.sea?.pub || user?.is?.pub'));
    assert.ok(js.includes('waitForBillingSessionReady'));
    assert.ok(js.includes('recoverBillingAuthSession'));
    assert.ok(js.includes("Refresh account to continue with Stripe billing on this tab."));
    assert.ok(js.includes('Legacy Stripe plan found:'));
    assert.ok(js.includes('older Stripe subscription was found for this billing email'));
    assert.ok(js.includes('Older Stripe billing history was found for this billing email'));
    assert.ok(js.includes("Manage subscription"));
    assert.ok(js.includes("View billing history"));
    assert.ok(js.includes('Review one subscription'));
    assert.ok(js.includes('Manage billing opens one record at a time.'));
    assert.ok(js.includes('return here, refresh, and open billing again'));
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
  });
});

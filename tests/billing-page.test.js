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
    assert.match(html, /id="manage-billing"/);
    assert.match(html, /data-plan-action="starter"/);
    assert.match(html, /data-plan-action="pro"/);
    assert.match(html, /data-plan-action="builder"/);
    assert.match(html, /id="custom-submit"/);
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
    assert.ok(js.includes("fetchJson('/api/stripe/checkout'"));
    assert.ok(js.includes("fetchJson('/api/stripe/status'"));
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const pageDir = new URL('../reseller-policy/', import.meta.url);

describe('reseller partner policy page', () => {
  it('publishes a general public partner policy', async () => {
    const html = await readFile(new URL('index.html', pageDir), 'utf8');

    assert.match(html, /Reseller &amp; Fulfillment Partner Policy \| 3DVR/);
    assert.match(html, /Approved pilots only/);
    assert.match(html, /3DVR does not operate an open marketplace/);
    assert.match(html, /When a customer pays through 3DVR's Stripe account, 3DVR is the merchant of/);
    assert.match(html, /Partner payout is not earned when the order is placed/);
    assert.match(html, /the stated\s+return or refund window has closed/);
    assert.match(html, /Direct access to 3DVR's Stripe account is only considered for someone who officially\s+joins 3DVR/);
    assert.match(html, /named, permission-limited, and removable/);
    assert.match(html, /No counterfeit, unauthorized branded, or trademark-risk products/);
    assert.match(html, /No regulated, age-restricted, hazardous, medical, supplement, weapon/);
    assert.match(html, /3DVR may refund a customer/);
    assert.match(html, /Stripe Connect setup/);
    assert.match(html, /Join 3DVR officially/);
    assert.match(html, /Customer data may only be used for fulfillment/);
    assert.match(html, /not legal, tax, medical, or financial advice/);
  });

  it('links to official payment and customer-protection resources', async () => {
    const html = await readFile(new URL('index.html', pageDir), 'utf8');

    assert.match(html, /https:\/\/stripe\.com\/legal\/restricted-businesses/);
    assert.match(html, /https:\/\/docs\.stripe\.com\/connect/);
    assert.match(html, /https:\/\/www\.ftc\.gov\/business-guidance\/resources\/business-guide-ftcs-mail-internet-or-telephone-order-merchandise-rule/);
  });

  it('keeps the policy responsive without external assets', async () => {
    const html = await readFile(new URL('index.html', pageDir), 'utf8');
    const css = await readFile(new URL('styles.css', pageDir), 'utf8');

    assert.match(html, /<link rel="stylesheet" href="\.\/styles\.css" \/>/);
    assert.doesNotMatch(html, /<img\b/);
    assert.doesNotMatch(html, /cdn\./);
    assert.match(css, /@media \(max-width: 780px\)/);
    assert.match(css, /grid-template-columns: 1fr/);
    assert.match(css, /text-size-adjust:\s*100%/);
  });

  it('links the sample storefront back to the public policy', async () => {
    const html = await readFile(new URL('../victor-dropship/index.html', import.meta.url), 'utf8');

    assert.match(html, /href="\/reseller-policy\/"/);
    assert.match(html, /Reseller &amp; fulfillment partner policy/);
  });
});

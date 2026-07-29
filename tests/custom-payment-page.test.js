import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

describe('custom payment page', () => {
  it('keeps the customer checkout flow minimal and no-account', async () => {
    const [html, app, portal] = await Promise.all([
      readFile(new URL('../custom-payment/index.html', import.meta.url), 'utf8'),
      readFile(new URL('../custom-payment/app.js', import.meta.url), 'utf8'),
      readFile(new URL('../index.html', import.meta.url), 'utf8')
    ]);

    assert.match(html, /Customer name/);
    assert.match(html, /Customer email/);
    assert.match(html, /What is it for\? <small>optional/);
    assert.match(html, /Stripe asks the customer for anything you leave blank/);
    assert.ok(app.includes('/api/stripe/custom-payment'));
    assert.match(app, /collectMissingFields = true/);
    assert.match(app, /navigator\.clipboard/);
    assert.ok(portal.includes('href="custom-payment/"'));
  });
});

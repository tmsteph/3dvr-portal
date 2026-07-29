import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildCrmQuoteFields,
  calculateQuoteTotals,
  quoteFromGunData,
  quoteToGunData,
  sanitizeQuote,
} from '../quote-builder/quote-model.js';

describe('quote builder', () => {
  it('keeps retail, supplier cost, tax, shipping, and margin separate', () => {
    const totals = calculateQuoteTotals({
      items: [
        { description: 'Custom shirts', quantity: 6, unitPrice: 30, unitCost: 15 },
        { description: 'Business cards', quantity: 1, unitPrice: 78, unitCost: 12 },
      ],
      taxRate: 8,
      shipping: 10,
    });

    assert.equal(totals.subtotalCents, 25800);
    assert.equal(totals.internalCostCents, 10200);
    assert.equal(totals.marginCents, 15600);
    assert.equal(totals.taxCents, 2064);
    assert.equal(totals.shippingCents, 1000);
    assert.equal(totals.totalCents, 28864);
  });

  it('builds compact quote status fields for the linked CRM record', () => {
    const quote = sanitizeQuote({
      id: 'quote-pedri',
      reference: 'PEDRI-001',
      crmRecordId: 'lead-pedri',
      customerName: 'Pedri',
      status: 'Payment link created',
      items: [{ description: 'Order', quantity: 1, unitPrice: 258 }],
      paymentUrl: 'https://checkout.stripe.com/example',
    });
    const fields = buildCrmQuoteFields(quote);

    assert.equal(fields.quoteId, 'quote-pedri');
    assert.equal(fields.quoteStatus, 'Payment link created');
    assert.equal(fields.quoteTotalCents, 25800);
    assert.equal(fields.offerAmount, '$258.00');
  });

  it('round-trips line items through Gun-safe flat data', () => {
    const stored = quoteToGunData({
      id: 'quote-1',
      customerName: 'Customer',
      items: [{ description: 'Cards', quantity: 1, unitPrice: 78, unitCost: 12 }],
    });

    assert.equal('items' in stored, false);
    assert.equal(typeof stored.itemsJson, 'string');
    const restored = quoteFromGunData(stored);
    assert.equal(restored.items.length, 1);
    assert.equal(restored.items[0].unitPriceCents, 7800);
    assert.equal(restored.items[0].unitCostCents, 1200);
  });

  it('ships as a portal app with CRM, PDF, and payment actions', async () => {
    const [html, app, css, portal, crmApp] = await Promise.all([
      readFile(new URL('../quote-builder/index.html', import.meta.url), 'utf8'),
      readFile(new URL('../quote-builder/app.js', import.meta.url), 'utf8'),
      readFile(new URL('../quote-builder/styles.css', import.meta.url), 'utf8'),
      readFile(new URL('../index.html', import.meta.url), 'utf8'),
      readFile(new URL('../crm/app.js', import.meta.url), 'utf8'),
    ]);

    assert.match(html, /Pull from CRM/);
    assert.match(html, /Print \/ Save PDF/);
    assert.match(html, /Create customer payment link/);
    assert.match(html, /Customer can enter this at checkout/);
    assert.match(app, /gun\.get\('3dvr-crm'\)/);
    assert.match(app, /\/api\/stripe\/custom-payment/);
    assert.match(app, /collectCustomerEmail: !quote\.customerEmail/);
    assert.match(css, /@media print/);
    assert.match(css, /\.no-print/);
    assert.match(portal, /href="quote-builder\/"/);
    assert.match(crmApp, /quote-builder\/\?crmRecordId=/);
  });
});

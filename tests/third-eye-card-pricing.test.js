import test from 'node:test';
import assert from 'node:assert/strict';
import { BUSINESS_CARD_PRODUCTS } from '../src/billing/business-card-products.js';

test('Third Eye business card pricing stays aligned with storefront tiers', () => {
  assert.deepEqual(
    Object.values(BUSINESS_CARD_PRODUCTS).map(({ quantity, priceCents }) => [quantity, priceCents]),
    [[50, 2000], [100, 2900], [200, 3900], [500, 5900]],
  );
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { BUSINESS_CARD_PRODUCTS, MAX_ARTWORK_BYTES, addBusinessDays, decodeArtworkFile, publicBusinessCardProducts } from '../src/billing/business-card-products.js';

test('public card product uses the confirmed 250-card standard price', () => {
  const product = BUSINESS_CARD_PRODUCTS['standard-250'];
  assert.equal(product.quantity, 250);
  assert.equal(product.quality, 'Standard 16pt');
  assert.equal(product.priceCents, 7800);
  assert.equal(product.businessDays, 2);
});

test('ready date skips weekends', () => {
  const thursday = new Date('2026-08-13T12:00:00-07:00');
  assert.equal(addBusinessDays(thursday, 2).toISOString().slice(0, 10), '2026-08-17');
  assert.equal(publicBusinessCardProducts(thursday)[0].estimatedReadyDate, '2026-08-17');
});

test('artwork decoder accepts PNG and measures decoded bytes', () => {
  const decoded = decodeArtworkFile({ side: 'front', name: 'card.png', type: 'image/png', data: Buffer.from('hello').toString('base64') });
  assert.equal(decoded.size, 5);
  assert.equal(decoded.content.toString('utf8'), 'hello');
  assert.ok(MAX_ARTWORK_BYTES > decoded.size);
});

test('artwork decoder rejects unsupported formats', () => {
  assert.throws(() => decodeArtworkFile({ side: 'front', name: 'card.svg', type: 'image/svg+xml', data: Buffer.from('<svg/>').toString('base64') }), /JPG, PNG, or PDF/);
});

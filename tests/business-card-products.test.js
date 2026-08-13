import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BUSINESS_CARD_PRODUCTS,
  MAX_ARTWORK_BYTES,
  addBusinessDays,
  decodeArtworkFile,
  publicBusinessCardProducts,
} from '../src/billing/business-card-products.js';
import {
  createBusinessCardOrderHandler,
  getBusinessCardCheckoutConfig,
} from '../src/billing/api-business-card-order.js';

const pngBytes = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('test-image'),
]);

function mockResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };
}

test('public card product uses the confirmed 200-card standard price', () => {
  const product = BUSINESS_CARD_PRODUCTS['standard-200'];
  assert.equal(product.quantity, 200);
  assert.equal(product.quality, 'Standard 16pt');
  assert.equal(product.priceCents, 3900);
  assert.equal(product.businessDays, 2);
});

test('ready date skips weekends in the San Diego business timezone', () => {
  const thursday = new Date('2026-08-13T20:30:00-07:00');
  assert.equal(addBusinessDays(thursday, 2).toISOString().slice(0, 10), '2026-08-17');
  assert.equal(publicBusinessCardProducts(thursday)[0].estimatedReadyDate, '2026-08-17');
});

test('artwork decoder accepts real PNG signatures and sanitizes file names', () => {
  const decoded = decodeArtworkFile({
    side: 'front',
    name: '../card\n.png',
    type: 'image/png',
    data: pngBytes.toString('base64'),
  });
  assert.equal(decoded.name.includes('/'), false);
  assert.equal(decoded.content.subarray(0, 8).equals(pngBytes.subarray(0, 8)), true);
  assert.ok(MAX_ARTWORK_BYTES > decoded.size);
});

test('artwork decoder rejects unsupported or mislabeled formats', () => {
  assert.throws(() => decodeArtworkFile({
    side: 'front',
    name: 'card.svg',
    type: 'image/svg+xml',
    data: Buffer.from('<svg/>').toString('base64'),
  }), /JPG, PNG, or PDF/);
  assert.throws(() => decodeArtworkFile({
    side: 'front',
    name: 'fake.png',
    type: 'image/png',
    data: Buffer.from('not a png').toString('base64'),
  }), /does not match/);
});

test('public catalog reports checkout readiness without exposing private costs', () => {
  const catalog = getBusinessCardCheckoutConfig({
    stripeConfigured: true,
    artworkUploadConfigured: true,
    now: new Date('2026-08-13T12:00:00-07:00'),
  });
  assert.equal(catalog.products[0].priceCents, 2000);
  assert.equal('unitCost' in catalog.products[0], false);
  assert.equal(catalog.stripeConfigured, true);
});

test('checkout ignores client amount and uses the server price', async () => {
  let stripePayload;
  let mailPayload;
  const stripeClient = {
    checkout: {
      sessions: {
        async create(payload) {
          stripePayload = payload;
          return { id: 'cs_test_123', url: 'https://checkout.stripe.test/session' };
        },
        async expire() { throw new Error('should not expire'); },
      },
    },
  };
  const mailTransport = {
    async sendMail(payload) { mailPayload = payload; },
  };
  const handler = createBusinessCardOrderHandler({
    stripeClient,
    mailTransport,
    config: {
      GMAIL_USER: 'orders@example.com',
      GMAIL_APP_PASSWORD: 'test-password',
      PORTAL_ORIGIN: 'https://portal.example.com',
    },
    now: () => new Date('2026-08-13T12:00:00-07:00'),
  });
  const res = mockResponse();

  await handler({
    headers: {},
    body: {
      productId: 'standard-200',
      orderId: 'CARD-TEST-1',
      amount: 1,
      artwork: [{
        side: 'front',
        name: 'front.png',
        type: 'image/png',
        data: pngBytes.toString('base64'),
      }],
    },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.estimatedReadyDate, '2026-08-17');
  assert.equal(stripePayload.line_items[0].price_data.unit_amount, 3900);
  assert.deepEqual(stripePayload.shipping_address_collection.allowed_countries, ['US']);
  assert.equal(stripePayload.metadata.order_id, 'CARD-TEST-1');
  assert.equal(mailPayload.attachments.length, 1);
  assert.equal(mailPayload.attachments[0].filename, 'front-front.png');
  assert.match(mailPayload.text, /Payment is not confirmed/);
});

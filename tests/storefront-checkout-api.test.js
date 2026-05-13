import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createStorefrontCheckoutHandler } from '../api/storefront/checkout.js';

function createMockRes() {
  return {
    statusCode: 200,
    body: undefined,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    end(payload) {
      this.body = payload;
      return this;
    },
    setHeader(key, value) {
      this.headers[key] = value;
    },
  };
}

describe('storefront checkout API', () => {
  it('reports checkout configuration on GET', async () => {
    const handler = createStorefrontCheckoutHandler({
      config: { STRIPE_SECRET_KEY: 'sk_test_sample' },
      stripeClient: { checkout: { sessions: { create: mock.fn() } } },
    });
    const res = createMockRes();

    await handler({ method: 'GET', headers: {} }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.stripeConfigured, true);
    assert.deepEqual(res.body.products, ['compact-desk-dock']);
  });

  it('creates a one-time Stripe Checkout session for the sample product', async () => {
    const create = mock.fn(async () => ({
      id: 'cs_test_storefront',
      url: 'https://checkout.stripe.com/c/pay/cs_test_storefront',
    }));
    const handler = createStorefrontCheckoutHandler({
      config: { STRIPE_SECRET_KEY: 'sk_test_sample' },
      stripeClient: { checkout: { sessions: { create } } },
    });
    const res = createMockRes();

    await handler({
      method: 'POST',
      headers: {
        host: 'portal.3dvr.tech',
        'x-forwarded-proto': 'https',
      },
      body: {
        orderId: 'order_123',
        productId: 'compact-desk-dock',
        quantity: 2,
        customerEmail: 'buyer@example.com',
        customerName: 'Buyer Example',
      },
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.id, 'cs_test_storefront');
    assert.equal(res.body.url, 'https://checkout.stripe.com/c/pay/cs_test_storefront');
    assert.equal(create.mock.calls.length, 1);

    const payload = create.mock.calls[0].arguments[0];
    assert.equal(payload.mode, 'payment');
    assert.equal(payload.customer_email, 'buyer@example.com');
    assert.equal(payload.metadata.order_id, 'order_123');
    assert.equal(payload.line_items[0].quantity, 2);
    assert.equal(payload.line_items[0].price_data.unit_amount, 7900);
    assert.match(payload.success_url, /\/victor-dropship\/\?checkout=success/);
  });

  it('rejects unknown products before creating checkout', async () => {
    const create = mock.fn();
    const handler = createStorefrontCheckoutHandler({
      config: { STRIPE_SECRET_KEY: 'sk_test_sample' },
      stripeClient: { checkout: { sessions: { create } } },
    });
    const res = createMockRes();

    await handler({
      method: 'POST',
      headers: {},
      body: {
        orderId: 'order_123',
        productId: 'missing',
      },
    }, res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, 'Unknown product.');
    assert.equal(create.mock.calls.length, 0);
  });
});

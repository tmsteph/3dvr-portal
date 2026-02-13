import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createTrialHandler } from '../api/trial.js';

const baseConfig = {
  STRIPE_SECRET_KEY: 'sk_test_key',
  STRIPE_PRICE_ID: 'price_123',
  GMAIL_USER: 'bot@example.com',
  GMAIL_APP_PASSWORD: 'app_password',
};

function createMockStripe(overrides = {}) {
  const stripe = {
    customers: {
      list: mock.fn(async () => ({ data: [] })),
      create: mock.fn(async ({ email }) => ({ id: 'cus_test', email })),
    },
    subscriptions: {
      list: mock.fn(async () => ({ data: [] })),
      create: mock.fn(async () => ({ id: 'sub_test' })),
    },
  };

  if (overrides.customers?.list) stripe.customers.list = overrides.customers.list;
  if (overrides.customers?.create) stripe.customers.create = overrides.customers.create;
  if (overrides.subscriptions?.list) stripe.subscriptions.list = overrides.subscriptions.list;
  if (overrides.subscriptions?.create) stripe.subscriptions.create = overrides.subscriptions.create;

  return stripe;
}

function createMailTransport() {
  return {
    sendMail: mock.fn(async () => ({})),
  };
}

function createMockRes() {
  return {
    statusCode: 200,
    body: undefined,
    headers: {},
    ended: false,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    end(payload) {
      this.ended = true;
      if (payload !== undefined) {
        this.body = payload;
      }
      return this;
    },
    setHeader(key, value) {
      this.headers[key] = value;
    },
  };
}

describe('trial handler', () => {
  it('responds to OPTIONS requests without processing', async () => {
    const stripe = createMockStripe();
    const mailTransport = createMailTransport();
    const handler = createTrialHandler({ stripeClient: stripe, mailTransport, config: baseConfig });

    const req = { method: 'OPTIONS', body: {} };
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.ended, true);
    assert.equal(stripe.customers.list.mock.calls.length, 0);
    assert.equal(mailTransport.sendMail.mock.calls.length, 0);
  });

  it('returns configuration diagnostics on GET without creating subscriptions', async () => {
    const stripe = createMockStripe();
    const mailTransport = createMailTransport();
    const handler = createTrialHandler({ stripeClient: stripe, mailTransport, config: baseConfig });

    const req = { method: 'GET', body: {} };
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, {
      stripeConfigured: true,
      priceConfigured: true,
      mailConfigured: true,
    });
    assert.equal(stripe.customers.list.mock.calls.length, 0);
    assert.equal(stripe.subscriptions.create.mock.calls.length, 0);
  });

  it('rejects invalid email payloads', async () => {
    const handler = createTrialHandler({
      stripeClient: createMockStripe(),
      mailTransport: createMailTransport(),
      config: baseConfig,
    });

    const req = { method: 'POST', body: {} };
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, { error: 'A valid email address is required.' });
  });

  it('returns a server error when Stripe config is incomplete', async () => {
    const handler = createTrialHandler({
      stripeClient: createMockStripe(),
      mailTransport: createMailTransport(),
      config: {
        ...baseConfig,
        STRIPE_PRICE_ID: undefined,
      },
    });

    const req = { method: 'POST', body: { email: 'user@example.com' } };
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { error: 'Stripe configuration is missing.' });
  });

  it('prevents duplicate trial subscriptions', async () => {
    const stripe = createMockStripe({
      subscriptions: {
        list: mock.fn(async () => ({ data: [{ status: 'active' }] })),
        create: mock.fn(),
      },
    });
    const mailTransport = createMailTransport();
    const handler = createTrialHandler({ stripeClient: stripe, mailTransport, config: baseConfig });

    const req = { method: 'POST', body: { email: 'existing@example.com' } };
    const res = createMockRes();

    await handler(req, res);

    assert.equal(stripe.subscriptions.create.mock.calls.length, 0);
    assert.equal(mailTransport.sendMail.mock.calls.length, 0);
    assert.equal(res.statusCode, 409);
    assert.deepEqual(res.body, { error: 'You already have an active or trialing subscription.' });
  });

  it('creates a trial and notifies the user and team', async () => {
    const stripe = createMockStripe();
    const mailTransport = createMailTransport();
    const handler = createTrialHandler({ stripeClient: stripe, mailTransport, config: baseConfig });

    const req = { method: 'POST', body: { email: 'new-user@example.com' } };
    const res = createMockRes();

    await handler(req, res);

    assert.deepEqual(stripe.customers.list.mock.calls[0].arguments[0], { email: 'new-user@example.com', limit: 1 });
    assert.deepEqual(stripe.subscriptions.create.mock.calls[0].arguments[0], {
      customer: 'cus_test',
      items: [{ price: baseConfig.STRIPE_PRICE_ID }],
      trial_period_days: 14,
      payment_behavior: 'default_incomplete',
    });
    assert.equal(mailTransport.sendMail.mock.calls.length, 2);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { success: true, subscriptionId: 'sub_test' });
  });
});

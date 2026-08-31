import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { calculateAvBookingEstimate, createTrialHandler } from '../api/trial.js';

const baseConfig = {
  STRIPE_SECRET_KEY: 'sk_test_key',
  STRIPE_PRICE_ID: 'price_123',
  GMAIL_USER: 'bot@example.com',
  GMAIL_APP_PASSWORD: 'app_password',
  OPERATOR_EMAIL_TO: 'operator@example.com',
  CHAT_PUSH_VAPID_PUBLIC_KEY: 'public-vapid-key',
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
    assert.equal(res.body.stripeConfigured, true);
    assert.equal(res.body.priceConfigured, true);
    assert.equal(res.body.mailConfigured, true);
    assert.equal(res.body.chatPushPublicKey, 'public-vapid-key');
    assert.equal(res.body.businessCardCheckout?.stripeConfigured, true);
    assert.equal(res.body.businessCardCheckout?.artworkUploadConfigured, true);
    assert.ok(Array.isArray(res.body.businessCardCheckout?.products));
    assert.ok(res.body.businessCardCheckout.products.length > 0);
    assert.equal(stripe.customers.list.mock.calls.length, 0);
    assert.equal(stripe.subscriptions.create.mock.calls.length, 0);
  });

  it('proxies supported chat push subscription actions without requiring an email', async () => {
    const chatPushStore = mock.fn(async action => ({ ok: true, action }));
    const handler = createTrialHandler({
      stripeClient: createMockStripe(),
      mailTransport: createMailTransport(),
      config: baseConfig,
      chatPushStore,
    });
    const req = {
      method: 'POST',
      body: { kind: 'chat-push', action: 'subscribe', userId: 'guest_123' },
    };
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { ok: true, action: 'subscribe' });
    assert.equal(chatPushStore.mock.calls.length, 1);
  });

  it('rejects attempts to manufacture chat notifications through the public API', async () => {
    const chatPushStore = mock.fn();
    const handler = createTrialHandler({
      stripeClient: createMockStripe(),
      mailTransport: createMailTransport(),
      config: baseConfig,
      chatPushStore,
    });
    const req = { method: 'POST', body: { kind: 'chat-push', action: 'notify' } };
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 400);
    assert.equal(chatPushStore.mock.calls.length, 0);
  });

  it('calculates AV booking overtime after a ten-hour day', () => {
    const estimate = calculateAvBookingEstimate({
      level: 'lead',
      technicians: 2,
      days: 2,
      hoursPerDay: 12,
    });

    assert.equal(estimate.dayRate, 750);
    assert.equal(estimate.baseTotal, 3000);
    assert.equal(estimate.overtimeHoursPerDay, 2);
    assert.equal(estimate.overtimeTotal, 900);
    assert.equal(estimate.total, 3900);
  });

  it('emails a valid AV booking request privately without touching Stripe', async () => {
    const stripe = createMockStripe();
    const mailTransport = createMailTransport();
    const handler = createTrialHandler({ stripeClient: stripe, mailTransport, config: baseConfig });
    const req = {
      method: 'POST',
      body: {
        kind: 'av-booking-request',
        source: '3dvr.tech/hire-av',
        name: 'Jordan Lee',
        email: 'jordan@example.com',
        company: 'Acme Events',
        phone: '555-0100',
        eventDate: '2026-09-15',
        venue: 'San Diego Convention Center',
        role: 'General session A1',
        level: 'lead',
        technicians: 1,
        days: 2,
        hoursPerDay: 10,
        notes: 'Need someone comfortable with corporate general sessions.',
        companyWebsite: '',
      },
    };
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { success: true, estimate: 1500, currency: 'USD' });
    assert.equal(mailTransport.sendMail.mock.calls.length, 1);
    assert.equal(stripe.customers.list.mock.calls.length, 0);
    assert.equal(stripe.subscriptions.create.mock.calls.length, 0);

    const message = mailTransport.sendMail.mock.calls[0].arguments[0];
    assert.equal(message.to, 'operator@example.com');
    assert.equal(message.replyTo, 'jordan@example.com');
    assert.match(message.subject, /AV booking request/);
    assert.match(message.text, /San Diego Convention Center/);
    assert.match(message.text, /"total": 1500/);
  });

  it('rejects incomplete AV booking requests without sending mail', async () => {
    const mailTransport = createMailTransport();
    const handler = createTrialHandler({
      stripeClient: createMockStripe(),
      mailTransport,
      config: baseConfig,
    });
    const req = {
      method: 'POST',
      body: {
        kind: 'av-booking-request',
        email: 'not-an-email',
        name: 'Jordan',
        level: 'lead',
        technicians: 1,
        days: 1,
        hoursPerDay: 10,
      },
    };
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 400);
    assert.equal(mailTransport.sendMail.mock.calls.length, 0);
  });

  it('silently drops honeypot AV booking spam', async () => {
    const mailTransport = createMailTransport();
    const handler = createTrialHandler({
      stripeClient: createMockStripe(),
      mailTransport,
      config: baseConfig,
    });
    const req = {
      method: 'POST',
      body: {
        kind: 'av-booking-request',
        companyWebsite: 'https://spam.example',
      },
    };
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { success: true });
    assert.equal(mailTransport.sendMail.mock.calls.length, 0);
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

import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createTrialHandler } from '../api/trial.js';

const baseConfig = {
  STRIPE_SECRET_KEY: 'sk_test_key',
  STRIPE_PRICE_ID: 'price_123',
  GMAIL_USER: 'bot@example.com',
  GMAIL_APP_PASSWORD: 'app_password',
  OPERATOR_EMAIL_TO: 'operator@example.com',
};

function createMockStripe() {
  return {
    customers: { list: mock.fn(), create: mock.fn() },
    subscriptions: { list: mock.fn(), create: mock.fn() },
  };
}

function createMailTransport() {
  return { sendMail: mock.fn(async () => ({})) };
}

function createMockRes() {
  return {
    statusCode: 200,
    body: undefined,
    headers: {},
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
    end() { return this; },
    setHeader(key, value) { this.headers[key] = value; },
  };
}

describe('cleaning network intake', () => {
  it('routes a lead to the configured partner without touching Stripe', async () => {
    const stripe = createMockStripe();
    const mailTransport = createMailTransport();
    const handler = createTrialHandler({
      stripeClient: stripe,
      mailTransport,
      config: {
        ...baseConfig,
        CLEANING_PARTNER_EMAILS_JSON: JSON.stringify({ 'crew-one': 'crew@example.com' }),
      },
    });
    const req = {
      method: 'POST',
      body: {
        kind: 'cleaning-lead',
        partner: 'crew-one',
        name: 'Taylor Homeowner',
        email: 'taylor@example.com',
        phone: '555-0199',
        postalCode: '92101',
        serviceType: 'Home cleaning',
        preferredDate: '2026-09-10',
        frequency: 'Every two weeks',
      },
    };
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { success: true });
    assert.equal(stripe.customers.list.mock.calls.length, 0);
    assert.equal(mailTransport.sendMail.mock.calls.length, 1);
    const message = mailTransport.sendMail.mock.calls[0].arguments[0];
    assert.equal(message.to, 'crew@example.com');
    assert.equal(message.replyTo, 'taylor@example.com');
    assert.match(message.text, /"partner": "crew-one"/);
  });

  it('accepts phone-only contact details and falls back to the operator inbox', async () => {
    const mailTransport = createMailTransport();
    const handler = createTrialHandler({
      stripeClient: createMockStripe(),
      mailTransport,
      config: baseConfig,
    });
    const req = {
      method: 'POST',
      body: {
        kind: 'cleaning-lead',
        name: 'Morgan',
        phone: '555-0112',
        postalCode: '92014',
        serviceType: 'Move in / move out',
      },
    };
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 200);
    const message = mailTransport.sendMail.mock.calls[0].arguments[0];
    assert.equal(message.to, 'operator@example.com');
    assert.equal(message.replyTo, 'bot@example.com');
  });

  it('rejects incomplete leads without sending mail', async () => {
    const mailTransport = createMailTransport();
    const handler = createTrialHandler({
      stripeClient: createMockStripe(),
      mailTransport,
      config: baseConfig,
    });
    const res = createMockRes();

    await handler({ method: 'POST', body: { kind: 'cleaning-lead', name: 'Morgan' } }, res);

    assert.equal(res.statusCode, 400);
    assert.equal(mailTransport.sendMail.mock.calls.length, 0);
  });
});

import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import SEA from 'gun/sea.js';
import {
  buildOperatorPaymentSessionPayload,
  createCustomPaymentHandler
} from '../src/billing/api-custom-payment.js';

const config = {
  STRIPE_SECRET_KEY: 'sk_test_key',
  PORTAL_ORIGIN: 'https://portal.3dvr.tech'
};

function response() {
  return {
    statusCode: 200,
    headers: {},
    status(code) { this.statusCode = code; return this; },
    setHeader(key, value) { this.headers[key] = value; },
    json(body) { this.body = body; return this; },
    end() { return this; }
  };
}

async function authBody(extra = {}) {
  const pair = await SEA.pair();
  const payload = {
    scope: 'stripe-billing',
    action: 'custom-payment',
    alias: 'operator@3dvr',
    pub: pair.pub,
    origin: config.PORTAL_ORIGIN,
    iat: Date.now()
  };

  return {
    ...extra,
    portalAlias: payload.alias,
    portalPub: pair.pub,
    authPub: pair.pub,
    authProof: await SEA.sign(payload, pair)
  };
}

describe('custom payment', () => {
  it('builds a no-account Stripe checkout with customer receipt details', () => {
    const payload = buildOperatorPaymentSessionPayload({
      amountCents: 12550,
      customerEmail: 'buyer@example.com',
      customerName: 'Buyer Name',
      description: '250 business cards',
      reference: 'BC-104',
      quoteId: 'quote-104',
      crmRecordId: 'lead-104',
      origin: config.PORTAL_ORIGIN
    });

    assert.equal(payload.mode, 'payment');
    assert.equal(payload.customer_email, 'buyer@example.com');
    assert.equal(payload.customer_creation, 'always');
    assert.equal(payload.line_items[0].price_data.unit_amount, 12550);
    assert.equal(payload.line_items[0].price_data.product_data.name, '250 business cards');
    assert.equal(payload.metadata.customer_name, 'Buyer Name');
    assert.equal(payload.metadata.quote_id, 'quote-104');
    assert.equal(payload.metadata.crm_record_id, 'lead-104');
    assert.equal(payload.success_url, 'https://portal.3dvr.tech/custom-payment/?payment=success');
  });

  it('lets Stripe collect the customer email at checkout when requested', () => {
    const payload = buildOperatorPaymentSessionPayload({
      amountCents: 25800,
      customerEmail: '',
      customerName: 'Pedri',
      description: '3DVR quote PEDRI-001',
      reference: 'PEDRI-001',
      quoteId: 'pedri-draft',
      crmRecordId: 'lead-pedri',
      collectCustomerEmail: true,
      origin: config.PORTAL_ORIGIN
    });

    assert.equal('customer_email' in payload, false);
    assert.equal(payload.customer_creation, 'always');
    assert.equal(payload.metadata.customer_email, undefined);
  });

  it('requires portal billing authentication before creating a link', async () => {
    const stripe = { checkout: { sessions: { create: mock.fn() } } };
    const handler = createCustomPaymentHandler({ stripeClient: stripe, config });
    const res = response();

    await handler({
      method: 'POST',
      body: {
        customerName: 'Buyer',
        customerEmail: 'buyer@example.com',
        amount: 25,
        description: 'Business cards'
      }
    }, res);

    assert.equal(res.statusCode, 401);
    assert.equal(stripe.checkout.sessions.create.mock.calls.length, 0);
  });

  it('creates a Stripe URL for valid operator-entered payment details', async () => {
    const create = mock.fn(async () => ({
      id: 'cs_custom',
      url: 'https://checkout.stripe.com/c/pay/cs_custom'
    }));
    const handler = createCustomPaymentHandler({
      stripeClient: { checkout: { sessions: { create } } },
      config
    });
    const res = response();

    await handler({
      method: 'POST',
      body: await authBody({
        customerName: ' Buyer Name ',
        customerEmail: 'BUYER@example.com',
        amount: '75.25',
        description: '  Business card print run ',
        reference: ' JOB-12 ',
        quoteId: ' quote-12 ',
        crmRecordId: ' lead-12 '
      })
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.url, 'https://checkout.stripe.com/c/pay/cs_custom');
    assert.equal(create.mock.calls.length, 1);
    assert.equal(create.mock.calls[0].arguments[0].line_items[0].price_data.unit_amount, 7525);
    assert.equal(create.mock.calls[0].arguments[0].customer_email, 'buyer@example.com');
    assert.equal(create.mock.calls[0].arguments[0].metadata.quote_id, 'quote-12');
    assert.equal(create.mock.calls[0].arguments[0].metadata.crm_record_id, 'lead-12');
  });

  it('creates a checkout that asks the customer for email when the quote has none', async () => {
    const create = mock.fn(async () => ({
      id: 'cs_customer_email',
      url: 'https://checkout.stripe.com/c/pay/cs_customer_email'
    }));
    const handler = createCustomPaymentHandler({
      stripeClient: { checkout: { sessions: { create } } },
      config
    });
    const res = response();

    await handler({
      method: 'POST',
      body: await authBody({
        customerName: 'Pedri',
        customerEmail: '',
        collectCustomerEmail: true,
        amount: '258',
        description: '3DVR quote PEDRI-001',
        quoteId: 'pedri-draft',
        crmRecordId: 'lead-pedri'
      })
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal('customer_email' in create.mock.calls[0].arguments[0], false);
    assert.equal(create.mock.calls[0].arguments[0].metadata.quote_id, 'pedri-draft');
  });
});

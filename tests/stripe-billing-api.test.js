import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createStripeCheckoutHandler } from '../api/stripe/checkout.js';
import { createStripeStatusHandler } from '../api/stripe/status.js';

const baseConfig = {
  STRIPE_SECRET_KEY: 'sk_test_key',
  STRIPE_PRICE_STARTER_ID: 'price_starter',
  STRIPE_PRICE_PRO_ID: 'price_pro',
  STRIPE_PRICE_BUILDER_ID: 'price_builder',
  PORTAL_ORIGIN: 'https://portal.3dvr.tech'
};

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
    }
  };
}

function createSubscription({
  id,
  status = 'active',
  created = 1,
  customer = 'cus_existing',
  plan = 'starter',
  priceId = 'price_starter'
} = {}) {
  return {
    id,
    status,
    created,
    customer,
    items: {
      data: [
        {
          id: `si_${id}`,
          quantity: 1,
          price: {
            id: priceId,
            metadata: { plan },
            nickname: plan
          }
        }
      ]
    }
  };
}

function createMockStripe(overrides = {}) {
  const stripe = {
    customers: {
      retrieve: mock.fn(async (customerId) => ({
        id: customerId,
        email: 'existing@example.com',
        metadata: {}
      })),
      list: mock.fn(async () => ({ data: [] })),
      create: mock.fn(async ({ email, metadata }) => ({
        id: 'cus_new',
        email,
        metadata: metadata || {}
      })),
      update: mock.fn(async (customerId, patch) => ({
        id: customerId,
        email: patch.email || 'existing@example.com',
        metadata: patch.metadata || {}
      })),
      search: mock.fn(async () => ({ data: [] }))
    },
    subscriptions: {
      list: mock.fn(async () => ({ data: [] }))
    },
    checkout: {
      sessions: {
        create: mock.fn(async () => ({
          id: 'cs_test',
          url: 'https://checkout.stripe.com/test-session'
        }))
      }
    },
    billingPortal: {
      sessions: {
        create: mock.fn(async () => ({
          id: 'bps_test',
          url: 'https://billing.stripe.com/test-session'
        }))
      }
    }
  };

  if (overrides.customers) {
    Object.assign(stripe.customers, overrides.customers);
  }
  if (overrides.subscriptions) {
    Object.assign(stripe.subscriptions, overrides.subscriptions);
  }
  if (overrides.checkout?.sessions) {
    Object.assign(stripe.checkout.sessions, overrides.checkout.sessions);
  }
  if (overrides.billingPortal?.sessions) {
    Object.assign(stripe.billingPortal.sessions, overrides.billingPortal.sessions);
  }

  return stripe;
}

describe('stripe billing checkout handler', () => {
  it('returns diagnostics on GET', async () => {
    const handler = createStripeCheckoutHandler({
      stripeClient: createMockStripe(),
      config: baseConfig
    });

    const req = { method: 'GET', body: {} };
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, {
      stripeConfigured: true,
      planPricesConfigured: {
        starter: true,
        pro: true,
        builder: true
      },
      customerPortalLoginConfigured: false
    });
  });

  it('creates a new subscription checkout session when no active subscription exists', async () => {
    const stripe = createMockStripe();
    const handler = createStripeCheckoutHandler({
      stripeClient: stripe,
      config: baseConfig
    });

    const req = {
      method: 'POST',
      body: {
        action: 'subscribe',
        plan: 'pro',
        billingEmail: 'new@example.com',
        portalAlias: 'new@3dvr',
        portalPub: 'pub_new'
      }
    };
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.flow, 'checkout_subscription');
    assert.equal(res.body.url, 'https://checkout.stripe.com/test-session');
    assert.equal(stripe.checkout.sessions.create.mock.calls.length, 1);
    assert.deepEqual(stripe.checkout.sessions.create.mock.calls[0].arguments[0], {
      mode: 'subscription',
      customer: 'cus_new',
      allow_promotion_codes: true,
      client_reference_id: 'pub_new',
      line_items: [{ price: 'price_pro', quantity: 1 }],
      metadata: {
        plan: 'pro',
        portal_alias: 'new@3dvr',
        portal_pub: 'pub_new',
        billing_email: 'new@example.com'
      },
      subscription_data: {
        metadata: {
          plan: 'pro',
          portal_alias: 'new@3dvr',
          portal_pub: 'pub_new',
          billing_email: 'new@example.com'
        }
      },
      success_url: 'https://portal.3dvr.tech/billing/?checkout=success&plan=pro&session_id={CHECKOUT_SESSION_ID}',
      cancel_url: 'https://portal.3dvr.tech/billing/?checkout=cancel&plan=pro'
    });
  });

  it('rejects invalid billing emails before creating checkout sessions', async () => {
    const stripe = createMockStripe();
    const handler = createStripeCheckoutHandler({
      stripeClient: stripe,
      config: baseConfig
    });

    const req = {
      method: 'POST',
      body: {
        action: 'subscribe',
        plan: 'starter',
        billingEmail: 'not-an-email',
        portalAlias: 'new@3dvr'
      }
    };
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, { error: 'Enter a valid billing email address.' });
    assert.equal(stripe.checkout.sessions.create.mock.calls.length, 0);
  });

  it('sends existing subscribers into a Stripe plan-switch confirmation flow', async () => {
    const stripe = createMockStripe({
      customers: {
        list: mock.fn(async () => ({
          data: [
            {
              id: 'cus_existing',
              email: 'existing@example.com',
              metadata: {}
            }
          ]
        }))
      },
      subscriptions: {
        list: mock.fn(async () => ({
          data: [
            createSubscription({
              id: 'sub_starter',
              plan: 'starter',
              priceId: 'price_starter'
            })
          ]
        }))
      }
    });

    const handler = createStripeCheckoutHandler({
      stripeClient: stripe,
      config: baseConfig
    });

    const req = {
      method: 'POST',
      body: {
        action: 'subscribe',
        plan: 'pro',
        billingEmail: 'existing@example.com',
        portalAlias: 'existing@3dvr',
        portalPub: 'pub_existing'
      }
    };
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.flow, 'portal_update');
    assert.equal(res.body.url, 'https://billing.stripe.com/test-session');
    assert.equal(stripe.billingPortal.sessions.create.mock.calls.length, 1);
    assert.deepEqual(stripe.billingPortal.sessions.create.mock.calls[0].arguments[0], {
      customer: 'cus_existing',
      return_url: 'https://portal.3dvr.tech/billing/?manage=return&plan=pro',
      flow_data: {
        type: 'subscription_update_confirm',
        after_completion: {
          type: 'redirect',
          redirect: {
            return_url: 'https://portal.3dvr.tech/billing/?manage=success&plan=pro'
          }
        },
        subscription_update_confirm: {
          subscription: 'sub_starter',
          items: [
            {
              id: 'si_sub_starter',
              price: 'price_pro',
              quantity: 1
            }
          ]
        }
      }
    });
    assert.equal(stripe.checkout.sessions.create.mock.calls.length, 0);
  });

  it('routes same-plan subscribers to general billing management instead of a second checkout', async () => {
    const stripe = createMockStripe({
      customers: {
        list: mock.fn(async () => ({
          data: [
            {
              id: 'cus_existing',
              email: 'existing@example.com',
              metadata: {}
            }
          ]
        }))
      },
      subscriptions: {
        list: mock.fn(async () => ({
          data: [
            createSubscription({
              id: 'sub_pro',
              plan: 'pro',
              priceId: 'price_pro'
            })
          ]
        }))
      }
    });

    const handler = createStripeCheckoutHandler({
      stripeClient: stripe,
      config: baseConfig
    });

    const req = {
      method: 'POST',
      body: {
        action: 'subscribe',
        plan: 'pro',
        billingEmail: 'existing@example.com'
      }
    };
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.flow, 'already_subscribed');
    assert.equal(stripe.billingPortal.sessions.create.mock.calls.length, 1);
    assert.deepEqual(stripe.billingPortal.sessions.create.mock.calls[0].arguments[0], {
      customer: 'cus_existing',
      return_url: 'https://portal.3dvr.tech/billing/?manage=return&plan=pro'
    });
    assert.equal(stripe.checkout.sessions.create.mock.calls.length, 0);
  });

  it('creates a one-time payment checkout session for custom work', async () => {
    const stripe = createMockStripe();
    const handler = createStripeCheckoutHandler({
      stripeClient: stripe,
      config: baseConfig
    });

    const req = {
      method: 'POST',
      body: {
        action: 'subscribe',
        plan: 'custom',
        billingEmail: 'client@example.com',
        portalAlias: 'client@3dvr',
        portalPub: 'pub_client',
        customAmount: 250,
        customLabel: 'Custom project deposit',
        customDescription: 'Scoped sprint deposit'
      }
    };
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.flow, 'checkout_payment');
    assert.equal(stripe.checkout.sessions.create.mock.calls.length, 1);
    assert.deepEqual(stripe.checkout.sessions.create.mock.calls[0].arguments[0], {
      mode: 'payment',
      customer: 'cus_new',
      allow_promotion_codes: true,
      client_reference_id: 'pub_client',
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: 25000,
            product_data: {
              name: 'Custom project deposit',
              description: 'Scoped sprint deposit',
              metadata: {
                plan: 'custom',
                portal_alias: 'client@3dvr',
                portal_pub: 'pub_client',
                billing_email: 'client@example.com'
              }
            }
          }
        }
      ],
      metadata: {
        plan: 'custom',
        portal_alias: 'client@3dvr',
        portal_pub: 'pub_client',
        billing_email: 'client@example.com'
      },
      success_url: 'https://portal.3dvr.tech/billing/?checkout=success&plan=custom&session_id={CHECKOUT_SESSION_ID}',
      cancel_url: 'https://portal.3dvr.tech/billing/?checkout=cancel&plan=custom'
    });
  });

  it('returns a clear message when billing management is opened before any paid record exists', async () => {
    const stripe = createMockStripe();
    const handler = createStripeCheckoutHandler({
      stripeClient: stripe,
      config: baseConfig
    });

    const req = {
      method: 'POST',
      body: {
        action: 'manage',
        portalAlias: 'new@3dvr'
      }
    };
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 409);
    assert.deepEqual(res.body, {
      error: 'No paid billing record was found for this account yet. Choose a plan below to start.'
    });
    assert.equal(stripe.billingPortal.sessions.create.mock.calls.length, 0);
  });
});

describe('stripe billing status handler', () => {
  it('returns free status when no matching customer exists', async () => {
    const stripe = createMockStripe();
    const handler = createStripeStatusHandler({
      stripeClient: stripe,
      config: baseConfig
    });

    const req = {
      method: 'POST',
      body: {
        portalAlias: 'nobody@3dvr',
        billingEmail: 'missing@example.com'
      }
    };
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, {
      ok: true,
      customerId: '',
      billingEmail: 'missing@example.com',
      currentPlan: 'free',
      usageTier: 'account',
      activeSubscriptions: [],
      duplicateActiveCount: 0,
      hasDuplicateActiveSubscriptions: false
    });
  });

  it('rejects invalid billing emails before checking Stripe status', async () => {
    const stripe = createMockStripe();
    const handler = createStripeStatusHandler({
      stripeClient: stripe,
      config: baseConfig
    });

    const req = {
      method: 'POST',
      body: {
        billingEmail: 'not-an-email'
      }
    };
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, { error: 'Enter a valid billing email address.' });
    assert.equal(stripe.customers.list.mock.calls.length, 0);
  });

  it('returns the highest active subscription and flags duplicates', async () => {
    const stripe = createMockStripe({
      customers: {
        list: mock.fn(async () => ({
          data: [
            {
              id: 'cus_existing',
              email: 'existing@example.com',
              metadata: {}
            }
          ]
        }))
      },
      subscriptions: {
        list: mock.fn(async () => ({
          data: [
            createSubscription({
              id: 'sub_starter',
              plan: 'starter',
              priceId: 'price_starter',
              created: 1
            }),
            createSubscription({
              id: 'sub_builder',
              plan: 'builder',
              priceId: 'price_builder',
              created: 2
            })
          ]
        }))
      }
    });

    const handler = createStripeStatusHandler({
      stripeClient: stripe,
      config: baseConfig
    });

    const req = {
      method: 'POST',
      body: {
        billingEmail: 'existing@example.com'
      }
    };
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.currentPlan, 'builder');
    assert.equal(res.body.usageTier, 'builder');
    assert.equal(res.body.duplicateActiveCount, 1);
    assert.equal(res.body.hasDuplicateActiveSubscriptions, true);
    assert.deepEqual(res.body.activeSubscriptions, [
      {
        id: 'sub_builder',
        status: 'active',
        plan: 'builder',
        priceId: 'price_builder'
      },
      {
        id: 'sub_starter',
        status: 'active',
        plan: 'starter',
        priceId: 'price_starter'
      }
    ]);
  });
});

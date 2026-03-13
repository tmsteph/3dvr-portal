import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import SEA from 'gun/sea.js';
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
      retrieve: mock.fn(async customerId => ({
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

async function createBillingAuth({
  alias = 'existing@3dvr',
  action = 'status',
  origin = baseConfig.PORTAL_ORIGIN,
  issuedAt = Date.now()
} = {}) {
  const pair = await SEA.pair();
  const authProof = await SEA.sign({
    scope: 'stripe-billing',
    action,
    alias,
    pub: pair.pub,
    origin,
    iat: issuedAt
  }, pair);

  return {
    alias,
    pub: pair.pub,
    authPub: pair.pub,
    authProof,
    issuedAt
  };
}

function buildAuthedBody(auth, body = {}) {
  return {
    ...body,
    authPub: auth.authPub,
    authProof: auth.authProof,
    portalAlias: auth.alias,
    portalPub: auth.pub
  };
}

function createPortalLinkedCustomer(auth, overrides = {}) {
  return {
    id: overrides.id || 'cus_existing',
    email: overrides.email || 'existing@example.com',
    metadata: {
      portal_pub: auth.pub,
      portal_alias: auth.alias,
      ...(overrides.metadata || {})
    }
  };
}

function createLegacyCustomer(overrides = {}) {
  return {
    id: overrides.id || 'cus_legacy',
    email: overrides.email || 'legacy@example.com',
    metadata: {
      ...(overrides.metadata || {})
    }
  };
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

  it('rejects unauthenticated POST billing requests before hitting Stripe', async () => {
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
        billingEmail: 'new@example.com'
      }
    };
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 401);
    assert.deepEqual(res.body, {
      error: 'Sign in again to verify billing access.'
    });
    assert.equal(stripe.checkout.sessions.create.mock.calls.length, 0);
    assert.equal(stripe.billingPortal.sessions.create.mock.calls.length, 0);
  });

  it('creates a new subscription checkout session when no linked Stripe customer exists', async () => {
    const auth = await createBillingAuth({
      alias: 'new@3dvr',
      action: 'subscribe'
    });
    const stripe = createMockStripe();
    const handler = createStripeCheckoutHandler({
      stripeClient: stripe,
      config: baseConfig
    });

    const req = {
      method: 'POST',
      body: buildAuthedBody(auth, {
        action: 'subscribe',
        plan: 'pro',
        billingEmail: 'new@example.com'
      })
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
      client_reference_id: auth.pub,
      line_items: [{ price: 'price_pro', quantity: 1 }],
      metadata: {
        plan: 'pro',
        portal_alias: auth.alias,
        portal_pub: auth.pub,
        billing_email: 'new@example.com'
      },
      subscription_data: {
        metadata: {
          plan: 'pro',
          portal_alias: auth.alias,
          portal_pub: auth.pub,
          billing_email: 'new@example.com'
        }
      },
      success_url: 'https://portal.3dvr.tech/billing/?checkout=success&plan=pro&session_id={CHECKOUT_SESSION_ID}',
      cancel_url: 'https://portal.3dvr.tech/billing/?checkout=cancel&plan=pro'
    });
  });

  it('prefers the live preview request host over PORTAL_ORIGIN when creating checkout sessions', async () => {
    const previewOrigin = 'https://3dvr-portal-old89t0jv-tmstephs-projects.vercel.app';
    const auth = await createBillingAuth({
      alias: 'preview@3dvr',
      action: 'subscribe',
      origin: previewOrigin
    });
    const stripe = createMockStripe();
    const handler = createStripeCheckoutHandler({
      stripeClient: stripe,
      config: {
        ...baseConfig,
        PORTAL_ORIGIN: 'https://3dvr-portal-git-staging-tmstephs-projects.vercel.app'
      }
    });

    const req = {
      method: 'POST',
      headers: {
        host: '3dvr-portal-old89t0jv-tmstephs-projects.vercel.app',
        'x-forwarded-proto': 'https'
      },
      body: buildAuthedBody(auth, {
        action: 'subscribe',
        plan: 'starter',
        billingEmail: 'preview@example.com'
      })
    };
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.flow, 'checkout_subscription');
    assert.equal(stripe.checkout.sessions.create.mock.calls.length, 1);
    assert.equal(
      stripe.checkout.sessions.create.mock.calls[0].arguments[0].success_url,
      `${previewOrigin}/billing/?checkout=success&plan=starter&session_id={CHECKOUT_SESSION_ID}`
    );
    assert.equal(
      stripe.checkout.sessions.create.mock.calls[0].arguments[0].cancel_url,
      `${previewOrigin}/billing/?checkout=cancel&plan=starter`
    );
  });

  it('rejects invalid billing emails before creating checkout sessions', async () => {
    const auth = await createBillingAuth({
      alias: 'new@3dvr',
      action: 'subscribe'
    });
    const stripe = createMockStripe();
    const handler = createStripeCheckoutHandler({
      stripeClient: stripe,
      config: baseConfig
    });

    const req = {
      method: 'POST',
      body: buildAuthedBody(auth, {
        action: 'subscribe',
        plan: 'starter',
        billingEmail: 'not-an-email'
      })
    };
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, { error: 'Enter a valid billing email address.' });
    assert.equal(stripe.checkout.sessions.create.mock.calls.length, 0);
  });

  it('sends linked subscribers into a Stripe plan-switch confirmation flow', async () => {
    const auth = await createBillingAuth({
      alias: 'existing@3dvr',
      action: 'subscribe'
    });
    const customer = createPortalLinkedCustomer(auth);
    const stripe = createMockStripe({
      customers: {
        search: mock.fn(async ({ query }) => ({
          data: query.includes(auth.pub) ? [customer] : []
        }))
      },
      subscriptions: {
        list: mock.fn(async () => ({
          data: [
            createSubscription({
              id: 'sub_starter',
              customer: customer.id,
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
      body: buildAuthedBody(auth, {
        action: 'subscribe',
        plan: 'pro',
        billingEmail: customer.email
      })
    };
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.flow, 'portal_update');
    assert.equal(res.body.url, 'https://billing.stripe.com/test-session');
    assert.equal(stripe.billingPortal.sessions.create.mock.calls.length, 1);
    assert.deepEqual(stripe.billingPortal.sessions.create.mock.calls[0].arguments[0], {
      customer: customer.id,
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
    assert.equal(stripe.customers.list.mock.calls.length, 0);
  });

  it('continues checkout when syncing billing hints fails for a matched portal customer', async () => {
    const auth = await createBillingAuth({
      alias: 'existing@3dvr',
      action: 'subscribe'
    });
    const customer = createPortalLinkedCustomer(auth, {
      email: '',
      metadata: {
        billing_email: ''
      }
    });
    const stripe = createMockStripe({
      customers: {
        search: mock.fn(async ({ query }) => ({
          data: query.includes(auth.pub) ? [customer] : []
        })),
        update: mock.fn(async () => {
          throw new Error('update failed');
        })
      }
    });

    const handler = createStripeCheckoutHandler({
      stripeClient: stripe,
      config: baseConfig
    });

    const req = {
      method: 'POST',
      body: buildAuthedBody(auth, {
        action: 'subscribe',
        plan: 'pro',
        billingEmail: 'existing@example.com'
      })
    };
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.flow, 'checkout_subscription');
    assert.equal(res.body.billingEmail, 'existing@example.com');
    assert.equal(stripe.customers.update.mock.calls.length, 1);
    assert.equal(stripe.checkout.sessions.create.mock.calls.length, 1);
  });

  it('routes same-plan linked subscribers to general billing management instead of a second checkout', async () => {
    const auth = await createBillingAuth({
      alias: 'existing@3dvr',
      action: 'subscribe'
    });
    const customer = createPortalLinkedCustomer(auth);
    const stripe = createMockStripe({
      customers: {
        search: mock.fn(async ({ query }) => ({
          data: query.includes(auth.pub) ? [customer] : []
        }))
      },
      subscriptions: {
        list: mock.fn(async () => ({
          data: [
            createSubscription({
              id: 'sub_pro',
              customer: customer.id,
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
      body: buildAuthedBody(auth, {
        action: 'subscribe',
        plan: 'pro',
        billingEmail: customer.email
      })
    };
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.flow, 'already_subscribed');
    assert.equal(stripe.billingPortal.sessions.create.mock.calls.length, 1);
    assert.deepEqual(stripe.billingPortal.sessions.create.mock.calls[0].arguments[0], {
      customer: customer.id,
      return_url: 'https://portal.3dvr.tech/billing/?manage=return&plan=pro'
    });
    assert.equal(stripe.checkout.sessions.create.mock.calls.length, 0);
  });

  it('creates a one-time payment checkout session for custom work', async () => {
    const auth = await createBillingAuth({
      alias: 'client@3dvr',
      action: 'subscribe'
    });
    const stripe = createMockStripe();
    const handler = createStripeCheckoutHandler({
      stripeClient: stripe,
      config: baseConfig
    });

    const req = {
      method: 'POST',
      body: buildAuthedBody(auth, {
        action: 'subscribe',
        plan: 'custom',
        billingEmail: 'client@example.com',
        customAmount: 250,
        customLabel: 'Custom project deposit',
        customDescription: 'Scoped sprint deposit'
      })
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
      client_reference_id: auth.pub,
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
                portal_alias: auth.alias,
                portal_pub: auth.pub,
                billing_email: 'client@example.com'
              }
            }
          }
        }
      ],
      metadata: {
        plan: 'custom',
        portal_alias: auth.alias,
        portal_pub: auth.pub,
        billing_email: 'client@example.com'
      },
      success_url: 'https://portal.3dvr.tech/billing/?checkout=success&plan=custom&session_id={CHECKOUT_SESSION_ID}',
      cancel_url: 'https://portal.3dvr.tech/billing/?checkout=cancel&plan=custom'
    });
  });

  it('returns a clear message when billing management is opened before any linked paid record exists', async () => {
    const auth = await createBillingAuth({
      alias: 'new@3dvr',
      action: 'manage'
    });
    const stripe = createMockStripe();
    const handler = createStripeCheckoutHandler({
      stripeClient: stripe,
      config: baseConfig
    });

    const req = {
      method: 'POST',
      body: buildAuthedBody(auth, {
        action: 'manage'
      })
    };
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 409);
    assert.deepEqual(res.body, {
      error: 'No portal-linked paid billing record was found for this signed-in account yet. Choose a plan below to start, or use your Stripe receipt link if this subscription predates portal linking.'
    });
    assert.equal(stripe.billingPortal.sessions.create.mock.calls.length, 0);
  });

  it('blocks new checkout when a legacy active subscription is found by billing email', async () => {
    const auth = await createBillingAuth({
      alias: 'legacy@3dvr',
      action: 'subscribe'
    });
    const legacyCustomer = createLegacyCustomer({
      email: 'legacy@example.com'
    });
    const stripe = createMockStripe({
      customers: {
        list: mock.fn(async ({ email }) => ({
          data: email === 'legacy@example.com' ? [legacyCustomer] : []
        }))
      },
      subscriptions: {
        list: mock.fn(async ({ customer }) => ({
          data: customer === legacyCustomer.id
            ? [
                createSubscription({
                  id: 'sub_legacy',
                  customer: legacyCustomer.id,
                  plan: 'starter',
                  priceId: 'price_starter'
                })
              ]
            : []
        }))
      }
    });
    const handler = createStripeCheckoutHandler({
      stripeClient: stripe,
      config: baseConfig
    });

    const req = {
      method: 'POST',
      body: buildAuthedBody(auth, {
        action: 'subscribe',
        plan: 'starter',
        billingEmail: 'legacy@example.com'
      })
    };
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 409);
    assert.equal(res.body.error, 'We found an older Stripe subscription for this billing email, but it is not linked to this portal account yet. To avoid creating a duplicate subscription, do not start a new plan here yet.');
    assert.equal(res.body.currentPlan, 'starter');
    assert.equal(res.body.portalLinked, false);
    assert.equal(res.body.statusSource, 'legacy_email');
    assert.equal(res.body.legacyNeedsLinking, true);
    assert.equal(res.body.customerId, '');
    assert.equal(stripe.checkout.sessions.create.mock.calls.length, 0);
  });
});

describe('stripe billing status handler', () => {
  it('rejects unauthenticated billing status requests', async () => {
    const stripe = createMockStripe();
    const handler = createStripeStatusHandler({
      stripeClient: stripe,
      config: baseConfig
    });

    const req = {
      method: 'POST',
      body: {
        billingEmail: 'missing@example.com'
      }
    };
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 401);
    assert.deepEqual(res.body, {
      error: 'Sign in again to verify billing access.'
    });
  });

  it('rejects expired billing auth proofs', async () => {
    const stripe = createMockStripe();
    const handler = createStripeStatusHandler({
      stripeClient: stripe,
      config: baseConfig
    });
    const auth = await createBillingAuth({
      alias: 'existing@3dvr',
      issuedAt: Date.now() - 10 * 60 * 1000
    });

    const req = {
      method: 'POST',
      body: buildAuthedBody(auth, {})
    };
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 401);
    assert.deepEqual(res.body, {
      error: 'Billing access proof expired. Refresh your sign-in and try again.'
    });
  });

  it('returns free status when no matching linked customer exists', async () => {
    const auth = await createBillingAuth({
      alias: 'nobody@3dvr'
    });
    const stripe = createMockStripe();
    const handler = createStripeStatusHandler({
      stripeClient: stripe,
      config: baseConfig
    });

    const req = {
      method: 'POST',
      body: buildAuthedBody(auth, {
        billingEmail: 'missing@example.com'
      })
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
      portalLinked: false,
      statusSource: 'not_found',
      legacyNeedsLinking: false,
      activeSubscriptions: [],
      duplicateActiveCount: 0,
      hasDuplicateActiveSubscriptions: false
    });
    assert.equal(stripe.customers.list.mock.calls.length, 1);
  });

  it('accepts billing proofs signed on the current preview host even when PORTAL_ORIGIN points at a branch alias', async () => {
    const previewOrigin = 'https://3dvr-portal-old89t0jv-tmstephs-projects.vercel.app';
    const auth = await createBillingAuth({
      alias: 'preview@3dvr',
      origin: previewOrigin
    });
    const stripe = createMockStripe();
    const handler = createStripeStatusHandler({
      stripeClient: stripe,
      config: {
        ...baseConfig,
        PORTAL_ORIGIN: 'https://3dvr-portal-git-staging-tmstephs-projects.vercel.app'
      }
    });

    const req = {
      method: 'POST',
      headers: {
        host: '3dvr-portal-old89t0jv-tmstephs-projects.vercel.app',
        'x-forwarded-proto': 'https'
      },
      body: buildAuthedBody(auth, {
        billingEmail: 'preview@example.com'
      })
    };
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.currentPlan, 'free');
    assert.equal(res.body.billingEmail, 'preview@example.com');
    assert.equal(res.body.statusSource, 'not_found');
  });

  it('rejects invalid billing emails before checking Stripe status', async () => {
    const auth = await createBillingAuth({
      alias: 'existing@3dvr'
    });
    const stripe = createMockStripe();
    const handler = createStripeStatusHandler({
      stripeClient: stripe,
      config: baseConfig
    });

    const req = {
      method: 'POST',
      body: buildAuthedBody(auth, {
        billingEmail: 'not-an-email'
      })
    };
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, { error: 'Enter a valid billing email address.' });
    assert.equal(stripe.customers.list.mock.calls.length, 0);
  });

  it('returns the highest active linked subscription and flags duplicates', async () => {
    const auth = await createBillingAuth({
      alias: 'existing@3dvr'
    });
    const customer = createPortalLinkedCustomer(auth);
    const stripe = createMockStripe({
      customers: {
        search: mock.fn(async ({ query }) => ({
          data: query.includes(auth.pub) ? [customer] : []
        }))
      },
      subscriptions: {
        list: mock.fn(async () => ({
          data: [
            createSubscription({
              id: 'sub_starter',
              customer: customer.id,
              plan: 'starter',
              priceId: 'price_starter',
              created: 1
            }),
            createSubscription({
              id: 'sub_builder',
              customer: customer.id,
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
      body: buildAuthedBody(auth, {
        billingEmail: customer.email
      })
    };
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.currentPlan, 'builder');
    assert.equal(res.body.usageTier, 'builder');
    assert.equal(res.body.portalLinked, true);
    assert.equal(res.body.statusSource, 'portal_linked');
    assert.equal(res.body.legacyNeedsLinking, false);
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
    assert.equal(stripe.customers.list.mock.calls.length, 0);
  });

  it('returns legacy active subscription status when an old unlinked Stripe customer matches the billing email', async () => {
    const auth = await createBillingAuth({
      alias: 'legacy@3dvr'
    });
    const legacyCustomer = createLegacyCustomer({
      email: 'legacy@example.com'
    });
    const stripe = createMockStripe({
      customers: {
        list: mock.fn(async ({ email }) => ({
          data: email === 'legacy@example.com' ? [legacyCustomer] : []
        }))
      },
      subscriptions: {
        list: mock.fn(async ({ customer }) => ({
          data: customer === legacyCustomer.id
            ? [
                createSubscription({
                  id: 'sub_legacy',
                  customer: legacyCustomer.id,
                  plan: 'starter',
                  priceId: 'price_starter'
                })
              ]
            : []
        }))
      }
    });
    const handler = createStripeStatusHandler({
      stripeClient: stripe,
      config: baseConfig
    });

    const req = {
      method: 'POST',
      body: buildAuthedBody(auth, {
        billingEmail: 'legacy@example.com'
      })
    };
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.currentPlan, 'starter');
    assert.equal(res.body.billingEmail, 'legacy@example.com');
    assert.equal(res.body.portalLinked, false);
    assert.equal(res.body.statusSource, 'legacy_email');
    assert.equal(res.body.legacyNeedsLinking, true);
    assert.equal(res.body.customerId, '');
    assert.deepEqual(res.body.activeSubscriptions, [
      {
        id: 'sub_legacy',
        status: 'active',
        plan: 'starter',
        priceId: 'price_starter'
      }
    ]);
  });

  it('keeps billing status available when syncing customer hints fails', async () => {
    const auth = await createBillingAuth({
      alias: 'existing@3dvr'
    });
    const customer = createPortalLinkedCustomer(auth, {
      email: '',
      metadata: {
        billing_email: ''
      }
    });
    const stripe = createMockStripe({
      customers: {
        search: mock.fn(async ({ query }) => ({
          data: query.includes(auth.pub) ? [customer] : []
        })),
        update: mock.fn(async () => {
          throw new Error('update failed');
        })
      }
    });

    const handler = createStripeStatusHandler({
      stripeClient: stripe,
      config: baseConfig
    });

    const req = {
      method: 'POST',
      body: buildAuthedBody(auth, {
        billingEmail: 'existing@example.com'
      })
    };
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.billingEmail, 'existing@example.com');
    assert.equal(res.body.currentPlan, 'free');
    assert.equal(stripe.customers.update.mock.calls.length, 1);
  });
});

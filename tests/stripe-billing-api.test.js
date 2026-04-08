import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import SEA from 'gun/sea.js';
import { createStripeCheckoutHandler } from '../src/billing/api-checkout.js';
import { createStripeStatusHandler } from '../src/billing/api-status.js';

const baseConfig = {
  STRIPE_SECRET_KEY: 'sk_test_key',
  STRIPE_PRICE_STARTER_ID: 'price_starter',
  STRIPE_PRICE_PRO_ID: 'price_pro',
  STRIPE_PRICE_BUILDER_ID: 'price_builder',
  STRIPE_PRICE_EMBEDDED_ID: 'price_embedded',
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

function createInvoice({
  id = 'in_test',
  created = 1,
  customer = 'cus_existing'
} = {}) {
  return {
    id,
    created,
    customer
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
      list: mock.fn(async () => ({ data: [] })),
      cancel: mock.fn(async subscriptionId => ({
        id: subscriptionId,
        status: 'canceled'
      }))
    },
    invoices: {
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
  if (overrides.invoices) {
    Object.assign(stripe.invoices, overrides.invoices);
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
    created: overrides.created || 0,
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
    created: overrides.created || 0,
    metadata: {
      ...(overrides.metadata || {})
    }
  };
}

function createStatefulCustomerMocks(seedCustomers = []) {
  const store = seedCustomers.map(customer => ({
    ...customer,
    metadata: {
      ...(customer?.metadata || {})
    }
  }));

  function normalizeMetadataPatch(existingMetadata = {}, patchMetadata = {}) {
    const nextMetadata = {
      ...existingMetadata
    };

    for (const [key, value] of Object.entries(patchMetadata || {})) {
      if (value === '') {
        delete nextMetadata[key];
      } else {
        nextMetadata[key] = value;
      }
    }

    return nextMetadata;
  }

  const customers = {
    retrieve: mock.fn(async customerId => {
      const customer = store.find(item => item.id === customerId);
      if (!customer) {
        throw new Error('not found');
      }
      return {
        ...customer,
        metadata: { ...(customer.metadata || {}) }
      };
    }),
    list: mock.fn(async ({ email } = {}) => ({
      data: store
        .filter(customer => !email || customer.email === email)
        .map(customer => ({
          ...customer,
          metadata: { ...(customer.metadata || {}) }
        }))
    })),
    update: mock.fn(async (customerId, patch = {}) => {
      const index = store.findIndex(item => item.id === customerId);
      const existing = index >= 0
        ? store[index]
        : { id: customerId, email: '', metadata: {} };
      const updated = {
        ...existing,
        ...patch,
        email: patch.email === undefined ? existing.email : patch.email,
        metadata: normalizeMetadataPatch(existing.metadata || {}, patch.metadata || {})
      };

      if (index >= 0) {
        store[index] = updated;
      } else {
        store.push(updated);
      }

      return {
        ...updated,
        metadata: { ...(updated.metadata || {}) }
      };
    }),
    search: mock.fn(async ({ query } = {}) => {
      const match = /metadata\['([^']+)'\]:'([^']+)'/.exec(String(query || ''));
      if (!match) {
        return { data: [] };
      }

      const [, key, value] = match;
      return {
        data: store
          .filter(customer => String(customer?.metadata?.[key] || '') === value)
          .map(customer => ({
            ...customer,
            metadata: { ...(customer.metadata || {}) }
          }))
      };
    })
  };

  return { customers, store };
}

function createStatefulSubscriptionMocks(seedSubscriptions = []) {
  const store = seedSubscriptions.map(subscription => JSON.parse(JSON.stringify(subscription)));

  const subscriptions = {
    list: mock.fn(async ({ customer } = {}) => ({
      data: store
        .filter(subscription => !customer || subscription.customer === customer)
        .map(subscription => JSON.parse(JSON.stringify(subscription)))
    })),
    cancel: mock.fn(async (subscriptionId, options = {}) => {
      const index = store.findIndex(subscription => subscription.id === subscriptionId);
      if (index < 0) {
        throw new Error('subscription not found');
      }

      store[index] = {
        ...store[index],
        status: 'canceled',
        cancellation_details: options
      };

      return JSON.parse(JSON.stringify(store[index]));
    })
  };

  return { subscriptions, store };
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
        builder: true,
        embedded: true
      },
      customerPortalLoginConfigured: false
    });
  });

  it('treats the legacy single-price env as the starter-plan fallback', async () => {
    const handler = createStripeCheckoutHandler({
      stripeClient: createMockStripe(),
      config: {
        STRIPE_SECRET_KEY: 'sk_test_key',
        STRIPE_PRICE_ID: 'price_legacy_starter',
        PORTAL_ORIGIN: 'https://portal.3dvr.tech'
      }
    });

    const req = { method: 'GET', body: {} };
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, {
      stripeConfigured: true,
      planPricesConfigured: {
        starter: true,
        pro: false,
        builder: false,
        embedded: false
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

  it('creates starter checkout sessions from the legacy single-price env', async () => {
    const auth = await createBillingAuth({
      alias: 'legacy-price@3dvr',
      action: 'subscribe'
    });
    const stripe = createMockStripe();
    const handler = createStripeCheckoutHandler({
      stripeClient: stripe,
      config: {
        STRIPE_SECRET_KEY: 'sk_test_key',
        STRIPE_PRICE_ID: 'price_legacy_starter',
        PORTAL_ORIGIN: 'https://portal.3dvr.tech'
      }
    });

    const req = {
      method: 'POST',
      body: buildAuthedBody(auth, {
        action: 'subscribe',
        plan: 'starter',
        billingEmail: 'legacy-price@example.com'
      })
    };
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.flow, 'checkout_subscription');
    assert.equal(stripe.checkout.sessions.create.mock.calls.length, 1);
    assert.deepEqual(stripe.checkout.sessions.create.mock.calls[0].arguments[0].line_items, [
      { price: 'price_legacy_starter', quantity: 1 }
    ]);
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
    assert.equal(stripe.customers.list.mock.calls.length, 1);
  });

  it('falls back to the generic Stripe plan-switcher when a target price is not mapped in env', async () => {
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
      config: {
        STRIPE_SECRET_KEY: 'sk_test_key',
        STRIPE_PRICE_STARTER_ID: 'price_starter',
        PORTAL_ORIGIN: 'https://portal.3dvr.tech'
      }
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
    assert.equal(res.body.flow, 'portal_update_select');
    assert.deepEqual(stripe.billingPortal.sessions.create.mock.calls[0].arguments[0], {
      customer: customer.id,
      return_url: 'https://portal.3dvr.tech/billing/?manage=return&plan=pro',
      flow_data: {
        type: 'subscription_update',
        after_completion: {
          type: 'redirect',
          redirect: {
            return_url: 'https://portal.3dvr.tech/billing/?manage=success&plan=pro'
          }
        },
        subscription_update: {
          subscription: 'sub_starter'
        }
      }
    });
    assert.equal(stripe.checkout.sessions.create.mock.calls.length, 0);
  });

  it('falls back to the generic Stripe plan-switcher when Stripe rejects a target price not in the portal configuration', async () => {
    const auth = await createBillingAuth({
      alias: 'existing@3dvr',
      action: 'subscribe'
    });
    const customer = createPortalLinkedCustomer(auth);
    const portalCreate = mock.fn(async payload => {
      if (payload?.flow_data?.type === 'subscription_update_confirm') {
        throw new Error(
          'The item `si_sub_starter` cannot be updated to price `price_builder` because the configuration '
          + '`bpc_test` does not include the price in its `features[subscription_update][products]`.'
        );
      }

      return {
        id: 'bps_fallback',
        url: 'https://billing.stripe.com/fallback-session'
      };
    });
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
      },
      billingPortal: {
        sessions: {
          create: portalCreate
        }
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
        plan: 'builder',
        billingEmail: customer.email
      })
    };
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.flow, 'portal_update_select');
    assert.equal(res.body.url, 'https://billing.stripe.com/fallback-session');
    assert.equal(portalCreate.mock.calls.length, 2);
    assert.deepEqual(portalCreate.mock.calls[0].arguments[0], {
      customer: customer.id,
      return_url: 'https://portal.3dvr.tech/billing/?manage=return&plan=builder',
      flow_data: {
        type: 'subscription_update_confirm',
        after_completion: {
          type: 'redirect',
          redirect: {
            return_url: 'https://portal.3dvr.tech/billing/?manage=success&plan=builder'
          }
        },
        subscription_update_confirm: {
          subscription: 'sub_starter',
          items: [
            {
              id: 'si_sub_starter',
              price: 'price_builder',
              quantity: 1
            }
          ]
        }
      }
    });
    assert.deepEqual(portalCreate.mock.calls[1].arguments[0], {
      customer: customer.id,
      return_url: 'https://portal.3dvr.tech/billing/?manage=return&plan=builder',
      flow_data: {
        type: 'subscription_update',
        after_completion: {
          type: 'redirect',
          redirect: {
            return_url: 'https://portal.3dvr.tech/billing/?manage=success&plan=builder'
          }
        },
        subscription_update: {
          subscription: 'sub_starter'
        }
      }
    });
    assert.equal(stripe.checkout.sessions.create.mock.calls.length, 0);
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

  it('creates a direct Stripe cancellation flow for an existing subscription', async () => {
    const auth = await createBillingAuth({
      alias: 'existing@3dvr',
      action: 'cancel'
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
        action: 'cancel',
        billingEmail: customer.email
      })
    };
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.flow, 'portal_cancel');
    assert.deepEqual(stripe.billingPortal.sessions.create.mock.calls[0].arguments[0], {
      customer: customer.id,
      return_url: 'https://portal.3dvr.tech/billing/?manage=return',
      flow_data: {
        type: 'subscription_cancel',
        after_completion: {
          type: 'redirect',
          redirect: {
            return_url: 'https://portal.3dvr.tech/billing/?manage=cancelled'
          }
        },
        subscription_cancel: {
          subscription: 'sub_starter'
        }
      }
    });
  });

  it('cancels an older legacy subscription found on an associated secondary billing email before opening cancel flow', async () => {
    const auth = await createBillingAuth({
      alias: 'existing@3dvr',
      action: 'cancel'
    });
    const linkedCustomer = createPortalLinkedCustomer(auth, {
      id: 'cus_newer',
      email: 'new@example.com'
    });
    const legacyCustomer = createLegacyCustomer({
      id: 'cus_older',
      email: 'old@example.com'
    });
    const customerMocks = createStatefulCustomerMocks([linkedCustomer, legacyCustomer]);
    const subscriptionMocks = createStatefulSubscriptionMocks([
      createSubscription({
        id: 'sub_newer',
        customer: linkedCustomer.id,
        plan: 'starter',
        priceId: 'price_starter',
        created: 20
      }),
      createSubscription({
        id: 'sub_older',
        customer: legacyCustomer.id,
        plan: 'starter',
        priceId: 'price_starter',
        created: 10
      })
    ]);
    const stripe = createMockStripe({
      customers: customerMocks.customers,
      subscriptions: subscriptionMocks.subscriptions
    });

    const handler = createStripeCheckoutHandler({
      stripeClient: stripe,
      config: baseConfig
    });

    const req = {
      method: 'POST',
      body: buildAuthedBody(auth, {
        action: 'cancel',
        billingEmail: 'new@example.com',
        billingEmails: ['new@example.com', 'old@example.com']
      })
    };
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.flow, 'portal_cancel');
    assert.equal(res.body.currentPlan, 'starter');
    assert.equal(stripe.subscriptions.cancel.mock.calls.length, 1);
    assert.deepEqual(stripe.subscriptions.cancel.mock.calls[0].arguments, [
      'sub_older',
      {
        invoice_now: false,
        prorate: false
      }
    ]);
    assert.deepEqual(stripe.billingPortal.sessions.create.mock.calls[0].arguments[0], {
      customer: linkedCustomer.id,
      return_url: 'https://portal.3dvr.tech/billing/?manage=return',
      flow_data: {
        type: 'subscription_cancel',
        after_completion: {
          type: 'redirect',
          redirect: {
            return_url: 'https://portal.3dvr.tech/billing/?manage=cancelled'
          }
        },
        subscription_cancel: {
          subscription: 'sub_newer'
        }
      }
    });
  });

  it('creates a cancellation flow for an alias-linked customer when portal_pub is missing', async () => {
    const auth = await createBillingAuth({
      alias: 'existing@3dvr',
      action: 'cancel'
    });
    const customer = createPortalLinkedCustomer(auth, {
      metadata: {
        portal_pub: ''
      }
    });
    const customerMocks = createStatefulCustomerMocks([customer]);
    const stripe = createMockStripe({
      customers: customerMocks.customers,
      subscriptions: {
        list: mock.fn(async ({ customer: customerId }) => ({
          data: customerId === customer.id
            ? [
                createSubscription({
                  id: 'sub_starter',
                  customer: customer.id,
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
        action: 'cancel',
        billingEmail: customer.email
      })
    };
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.flow, 'portal_cancel');
    assert.equal(customerMocks.store[0].metadata.portal_alias, auth.alias);
    assert.equal(customerMocks.store[0].metadata.portal_pub, auth.pub);
    assert.deepEqual(stripe.billingPortal.sessions.create.mock.calls[0].arguments[0], {
      customer: customer.id,
      return_url: 'https://portal.3dvr.tech/billing/?manage=return',
      flow_data: {
        type: 'subscription_cancel',
        after_completion: {
          type: 'redirect',
          redirect: {
            return_url: 'https://portal.3dvr.tech/billing/?manage=cancelled'
          }
        },
        subscription_cancel: {
          subscription: 'sub_starter'
        }
      }
    });
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
                billing_email: 'client@example.com',
                custom_label: 'Custom project deposit',
                custom_description: 'Scoped sprint deposit',
                custom_amount_cents: '25000'
              }
            }
          }
        }
      ],
      metadata: {
        plan: 'custom',
        portal_alias: auth.alias,
        portal_pub: auth.pub,
        billing_email: 'client@example.com',
        custom_label: 'Custom project deposit',
        custom_description: 'Scoped sprint deposit',
        custom_amount_cents: '25000'
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

  it('auto-links a single legacy active subscription before routing same-plan checkout into billing management', async () => {
    const auth = await createBillingAuth({
      alias: 'legacy@3dvr',
      action: 'subscribe'
    });
    const legacyCustomer = createLegacyCustomer({
      email: 'legacy@example.com'
    });
    const customerMocks = createStatefulCustomerMocks([legacyCustomer]);
    const stripe = createMockStripe({
      customers: customerMocks.customers,
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

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.flow, 'already_subscribed');
    assert.equal(res.body.currentPlan, 'starter');
    assert.equal(res.body.portalLinked, true);
    assert.equal(res.body.statusSource, 'portal_linked');
    assert.equal(res.body.legacyNeedsLinking, false);
    assert.equal(res.body.customerId, legacyCustomer.id);
    assert.equal(res.body.autoLinkedLegacy, true);
    assert.equal(stripe.checkout.sessions.create.mock.calls.length, 0);
    assert.equal(stripe.billingPortal.sessions.create.mock.calls.length, 1);
    assert.equal(stripe.customers.update.mock.calls.length, 1);
    assert.deepEqual(customerMocks.store[0].metadata, {
      portal_alias: auth.alias,
      portal_pub: auth.pub,
      billing_email: 'legacy@example.com'
    });
  });

  it('lets a single legacy active subscription open the generic Stripe plan-switcher', async () => {
    const auth = await createBillingAuth({
      alias: 'legacy@3dvr',
      action: 'subscribe'
    });
    const legacyCustomer = createLegacyCustomer({
      email: 'legacy@example.com'
    });
    const customerMocks = createStatefulCustomerMocks([legacyCustomer]);
    const stripe = createMockStripe({
      customers: customerMocks.customers,
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
      config: {
        STRIPE_SECRET_KEY: 'sk_test_key',
        STRIPE_PRICE_STARTER_ID: 'price_starter',
        PORTAL_ORIGIN: 'https://portal.3dvr.tech'
      }
    });

    const req = {
      method: 'POST',
      body: buildAuthedBody(auth, {
        action: 'subscribe',
        plan: 'pro',
        billingEmail: 'legacy@example.com'
      })
    };
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.flow, 'portal_update_select');
    assert.equal(res.body.legacyNeedsLinking, false);
    assert.equal(res.body.autoLinkedLegacy, true);
    assert.deepEqual(stripe.billingPortal.sessions.create.mock.calls[0].arguments[0], {
      customer: legacyCustomer.id,
      return_url: 'https://portal.3dvr.tech/billing/?manage=return&plan=pro',
      flow_data: {
        type: 'subscription_update',
        after_completion: {
          type: 'redirect',
          redirect: {
            return_url: 'https://portal.3dvr.tech/billing/?manage=success&plan=pro'
          }
        },
        subscription_update: {
          subscription: 'sub_legacy'
        }
      }
    });
  });

  it('auto-cleans legacy duplicates and keeps the newest subscription during checkout', async () => {
    const auth = await createBillingAuth({
      alias: 'legacy@3dvr',
      action: 'subscribe'
    });
    const firstLegacyCustomer = createLegacyCustomer({
      id: 'cus_legacy_one',
      email: 'legacy@example.com'
    });
    const secondLegacyCustomer = createLegacyCustomer({
      id: 'cus_legacy_two',
      email: 'legacy@example.com'
    });
    const customerMocks = createStatefulCustomerMocks([firstLegacyCustomer, secondLegacyCustomer]);
    const subscriptionMocks = createStatefulSubscriptionMocks([
      createSubscription({
        id: 'sub_builder',
        customer: firstLegacyCustomer.id,
        plan: 'builder',
        priceId: 'price_builder',
        created: 10
      }),
      createSubscription({
        id: 'sub_starter',
        customer: secondLegacyCustomer.id,
        plan: 'starter',
        priceId: 'price_starter',
        created: 20
      })
    ]);
    const stripe = createMockStripe({
      customers: customerMocks.customers,
      subscriptions: subscriptionMocks.subscriptions
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

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.flow, 'already_subscribed');
    assert.equal(res.body.currentPlan, 'starter');
    assert.equal(res.body.portalLinked, true);
    assert.equal(res.body.statusSource, 'portal_linked');
    assert.equal(res.body.legacyNeedsLinking, false);
    assert.equal(res.body.hasDuplicateActiveSubscriptions, false);
    assert.equal(res.body.duplicateActiveCount, 0);
    assert.equal(res.body.autoLinkedLegacy, true);
    assert.deepEqual(res.body.activeSubscriptions, [
      {
        id: 'sub_starter',
        status: 'active',
        plan: 'starter',
        priceId: 'price_starter'
      }
    ]);
    assert.equal(stripe.checkout.sessions.create.mock.calls.length, 0);
    assert.equal(stripe.subscriptions.cancel.mock.calls.length, 1);
    assert.deepEqual(stripe.subscriptions.cancel.mock.calls[0].arguments, [
      'sub_builder',
      {
        invoice_now: false,
        prorate: false
      }
    ]);
    assert.deepEqual(customerMocks.store[1].metadata, {
      portal_alias: auth.alias,
      portal_pub: auth.pub,
      billing_email: 'legacy@example.com'
    });
    assert.deepEqual(stripe.billingPortal.sessions.create.mock.calls[0].arguments[0], {
      customer: secondLegacyCustomer.id,
      return_url: 'https://portal.3dvr.tech/billing/?manage=return&plan=starter'
    });
  });

  it('auto-links a richer legacy customer and clears placeholder links before opening billing management', async () => {
    const auth = await createBillingAuth({
      alias: 'legacy@3dvr',
      action: 'manage'
    });
    const linkedCustomer = createPortalLinkedCustomer(auth, {
      id: 'cus_linked',
      email: 'legacy@example.com',
      created: 50
    });
    const legacyCustomer = createLegacyCustomer({
      id: 'cus_legacy',
      email: 'legacy@example.com',
      created: 10
    });
    const customerMocks = createStatefulCustomerMocks([linkedCustomer, legacyCustomer]);
    const stripe = createMockStripe({
      customers: customerMocks.customers,
      subscriptions: {
        list: mock.fn(async ({ customer }) => ({
          data: customer === legacyCustomer.id
            ? [
                createSubscription({
                  id: 'sub_legacy',
                  customer: legacyCustomer.id,
                  plan: 'pro',
                  priceId: 'price_pro',
                  created: 100
                })
              ]
            : []
        }))
      },
      invoices: {
        list: mock.fn(async ({ customer }) => ({
          data: customer === legacyCustomer.id
            ? [createInvoice({ id: 'in_legacy', customer, created: 200 })]
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
        action: 'manage',
        customerId: linkedCustomer.id,
        billingEmail: 'legacy@example.com'
      })
    };
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.flow, 'portal_manage');
    assert.equal(res.body.statusSource, 'portal_linked');
    assert.equal(res.body.legacyNeedsLinking, false);
    assert.equal(res.body.hasInvoiceHistory, true);
    assert.equal(res.body.autoLinkedLegacy, true);
    assert.deepEqual(stripe.billingPortal.sessions.create.mock.calls[0].arguments[0], {
      customer: legacyCustomer.id,
      return_url: 'https://portal.3dvr.tech/billing/?manage=return'
    });
    assert.equal(customerMocks.store.find(customer => customer.id === linkedCustomer.id)?.metadata?.portal_pub, undefined);
    assert.equal(customerMocks.store.find(customer => customer.id === linkedCustomer.id)?.metadata?.portal_alias, undefined);
    assert.equal(customerMocks.store.find(customer => customer.id === linkedCustomer.id)?.metadata?.canonical_customer_id, legacyCustomer.id);
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
      hasInvoiceHistory: false,
      legacyBillingManagementAvailable: false,
      autoLinkedLegacy: false,
      activeSubscriptions: [],
      duplicateActiveCount: 0,
      hasDuplicateActiveSubscriptions: false
    });
    assert.equal(stripe.customers.list.mock.calls.length, 1);
  });

  it('cancels an older legacy subscription found on an associated secondary billing email during status refresh', async () => {
    const auth = await createBillingAuth({
      alias: 'existing@3dvr'
    });
    const linkedCustomer = createPortalLinkedCustomer(auth, {
      id: 'cus_newer',
      email: 'new@example.com'
    });
    const legacyCustomer = createLegacyCustomer({
      id: 'cus_older',
      email: 'old@example.com'
    });
    const customerMocks = createStatefulCustomerMocks([linkedCustomer, legacyCustomer]);
    const subscriptionMocks = createStatefulSubscriptionMocks([
      createSubscription({
        id: 'sub_newer',
        customer: linkedCustomer.id,
        plan: 'starter',
        priceId: 'price_starter',
        created: 20
      }),
      createSubscription({
        id: 'sub_older',
        customer: legacyCustomer.id,
        plan: 'starter',
        priceId: 'price_starter',
        created: 10
      })
    ]);
    const stripe = createMockStripe({
      customers: customerMocks.customers,
      subscriptions: subscriptionMocks.subscriptions
    });
    const handler = createStripeStatusHandler({
      stripeClient: stripe,
      config: baseConfig
    });

    const req = {
      method: 'POST',
      body: buildAuthedBody(auth, {
        billingEmail: 'new@example.com',
        billingEmails: ['new@example.com', 'old@example.com']
      })
    };
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.currentPlan, 'starter');
    assert.equal(res.body.portalLinked, true);
    assert.equal(res.body.statusSource, 'portal_linked');
    assert.equal(res.body.legacyNeedsLinking, false);
    assert.equal(res.body.hasDuplicateActiveSubscriptions, false);
    assert.deepEqual(res.body.activeSubscriptions, [
      {
        id: 'sub_newer',
        status: 'active',
        plan: 'starter',
        priceId: 'price_starter'
      }
    ]);
    assert.equal(stripe.subscriptions.cancel.mock.calls.length, 1);
    assert.deepEqual(stripe.subscriptions.cancel.mock.calls[0].arguments, [
      'sub_older',
      {
        invoice_now: false,
        prorate: false
      }
    ]);
  });

  it('finds alias-linked customers when portal_pub is missing and returns the active subscription', async () => {
    const auth = await createBillingAuth({
      alias: 'existing@3dvr'
    });
    const customer = createPortalLinkedCustomer(auth, {
      metadata: {
        portal_pub: ''
      }
    });
    const customerMocks = createStatefulCustomerMocks([customer]);
    const stripe = createMockStripe({
      customers: customerMocks.customers,
      subscriptions: {
        list: mock.fn(async ({ customer: customerId }) => ({
          data: customerId === customer.id
            ? [
                createSubscription({
                  id: 'sub_starter',
                  customer: customer.id,
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
        billingEmail: customer.email
      })
    };
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.currentPlan, 'starter');
    assert.equal(res.body.portalLinked, true);
    assert.equal(res.body.statusSource, 'portal_linked');
    assert.equal(res.body.legacyNeedsLinking, false);
    assert.equal(res.body.customerId, customer.id);
    assert.deepEqual(res.body.activeSubscriptions, [
      {
        id: 'sub_starter',
        status: 'active',
        plan: 'starter',
        priceId: 'price_starter'
      }
    ]);
    assert.equal(customerMocks.store[0].metadata.portal_alias, auth.alias);
    assert.equal(customerMocks.store[0].metadata.portal_pub, auth.pub);
    assert.equal(stripe.customers.update.mock.calls.length, 1);
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

  it('auto-cleans linked duplicates and keeps the newest active subscription', async () => {
    const auth = await createBillingAuth({
      alias: 'existing@3dvr'
    });
    const customer = createPortalLinkedCustomer(auth);
    const subscriptionMocks = createStatefulSubscriptionMocks([
      createSubscription({
        id: 'sub_builder',
        customer: customer.id,
        plan: 'builder',
        priceId: 'price_builder',
        created: 1
      }),
      createSubscription({
        id: 'sub_starter',
        customer: customer.id,
        plan: 'starter',
        priceId: 'price_starter',
        created: 2
      })
    ]);
    const stripe = createMockStripe({
      customers: {
        search: mock.fn(async ({ query }) => ({
          data: query.includes(auth.pub) ? [customer] : []
        }))
      },
      subscriptions: subscriptionMocks.subscriptions
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
    assert.equal(res.body.currentPlan, 'starter');
    assert.equal(res.body.usageTier, 'supporter');
    assert.equal(res.body.portalLinked, true);
    assert.equal(res.body.statusSource, 'portal_linked');
    assert.equal(res.body.legacyNeedsLinking, false);
    assert.equal(res.body.duplicateActiveCount, 0);
    assert.equal(res.body.hasDuplicateActiveSubscriptions, false);
    assert.deepEqual(res.body.activeSubscriptions, [
      {
        id: 'sub_starter',
        status: 'active',
        plan: 'starter',
        priceId: 'price_starter'
      }
    ]);
    assert.equal(stripe.subscriptions.cancel.mock.calls.length, 1);
    assert.deepEqual(stripe.subscriptions.cancel.mock.calls[0].arguments, [
      'sub_builder',
      {
        invoice_now: false,
        prorate: false
      }
    ]);
    assert.equal(stripe.customers.list.mock.calls.length, 2);
  });

  it('auto-links a single legacy active subscription during status refresh', async () => {
    const auth = await createBillingAuth({
      alias: 'legacy@3dvr'
    });
    const legacyCustomer = createLegacyCustomer({
      email: 'legacy@example.com'
    });
    const customerMocks = createStatefulCustomerMocks([legacyCustomer]);
    const stripe = createMockStripe({
      customers: customerMocks.customers,
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
    assert.equal(res.body.portalLinked, true);
    assert.equal(res.body.statusSource, 'portal_linked');
    assert.equal(res.body.legacyNeedsLinking, false);
    assert.equal(res.body.customerId, legacyCustomer.id);
    assert.equal(res.body.autoLinkedLegacy, true);
    assert.deepEqual(res.body.activeSubscriptions, [
      {
        id: 'sub_legacy',
        status: 'active',
        plan: 'starter',
        priceId: 'price_starter'
      }
    ]);
    assert.equal(stripe.customers.update.mock.calls.length, 1);
  });

  it('does not auto-link when one active legacy subscription shares an email with older invoice history on another customer', async () => {
    const auth = await createBillingAuth({
      alias: 'legacy@3dvr'
    });
    const activeLegacyCustomer = createLegacyCustomer({
      id: 'cus_legacy_active',
      email: 'legacy@example.com'
    });
    const historyOnlyCustomer = createLegacyCustomer({
      id: 'cus_legacy_history',
      email: 'legacy@example.com'
    });
    const stripe = createMockStripe({
      customers: {
        list: mock.fn(async ({ email }) => ({
          data: email === 'legacy@example.com' ? [activeLegacyCustomer, historyOnlyCustomer] : []
        }))
      },
      subscriptions: {
        list: mock.fn(async ({ customer }) => ({
          data: customer === activeLegacyCustomer.id
            ? [
                createSubscription({
                  id: 'sub_legacy',
                  customer: activeLegacyCustomer.id,
                  plan: 'starter',
                  priceId: 'price_starter'
                })
              ]
            : []
        }))
      },
      invoices: {
        list: mock.fn(async ({ customer }) => ({
          data: customer === historyOnlyCustomer.id
            ? [createInvoice({ id: 'in_history', customer, created: 20 })]
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
    assert.equal(res.body.portalLinked, false);
    assert.equal(res.body.statusSource, 'legacy_email');
    assert.equal(res.body.legacyNeedsLinking, true);
    assert.equal(res.body.autoLinkedLegacy, false);
    assert.equal(stripe.customers.update.mock.calls.length, 0);
  });

  it('auto-links the newest legacy subscription and cancels older legacy duplicates during status refresh', async () => {
    const auth = await createBillingAuth({
      alias: 'legacy@3dvr'
    });
    const firstLegacyCustomer = createLegacyCustomer({
      id: 'cus_legacy_one',
      email: 'legacy@example.com'
    });
    const secondLegacyCustomer = createLegacyCustomer({
      id: 'cus_legacy_two',
      email: 'legacy@example.com'
    });
    const customerMocks = createStatefulCustomerMocks([firstLegacyCustomer, secondLegacyCustomer]);
    const subscriptionMocks = createStatefulSubscriptionMocks([
      createSubscription({
        id: 'sub_builder',
        customer: firstLegacyCustomer.id,
        plan: 'builder',
        priceId: 'price_builder',
        created: 10
      }),
      createSubscription({
        id: 'sub_starter',
        customer: secondLegacyCustomer.id,
        plan: 'starter',
        priceId: 'price_starter',
        created: 20
      })
    ]);
    const stripe = createMockStripe({
      customers: customerMocks.customers,
      subscriptions: subscriptionMocks.subscriptions
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
    assert.equal(res.body.portalLinked, true);
    assert.equal(res.body.statusSource, 'portal_linked');
    assert.equal(res.body.legacyNeedsLinking, false);
    assert.equal(res.body.autoLinkedLegacy, true);
    assert.equal(res.body.hasDuplicateActiveSubscriptions, false);
    assert.equal(res.body.duplicateActiveCount, 0);
    assert.deepEqual(res.body.activeSubscriptions, [
      {
        id: 'sub_starter',
        status: 'active',
        plan: 'starter',
        priceId: 'price_starter'
      }
    ]);
    assert.equal(stripe.subscriptions.cancel.mock.calls.length, 1);
    assert.deepEqual(stripe.subscriptions.cancel.mock.calls[0].arguments, [
      'sub_builder',
      {
        invoice_now: false,
        prorate: false
      }
    ]);
    assert.deepEqual(customerMocks.store[1].metadata, {
      portal_alias: auth.alias,
      portal_pub: auth.pub,
      billing_email: 'legacy@example.com'
    });
  });

  it('auto-links a richer legacy active subscription over a newer empty portal-linked customer', async () => {
    const auth = await createBillingAuth({
      alias: 'legacy@3dvr'
    });
    const linkedCustomer = createPortalLinkedCustomer(auth, {
      id: 'cus_linked',
      email: 'legacy@example.com',
      created: 50
    });
    const legacyCustomer = createLegacyCustomer({
      id: 'cus_legacy',
      email: 'legacy@example.com',
      created: 10
    });
    const customerMocks = createStatefulCustomerMocks([linkedCustomer, legacyCustomer]);
    const stripe = createMockStripe({
      customers: customerMocks.customers,
      subscriptions: {
        list: mock.fn(async ({ customer }) => ({
          data: customer === legacyCustomer.id
            ? [
                createSubscription({
                  id: 'sub_legacy',
                  customer: legacyCustomer.id,
                  plan: 'pro',
                  priceId: 'price_pro',
                  created: 100
                })
              ]
            : []
        }))
      },
      invoices: {
        list: mock.fn(async ({ customer }) => ({
          data: customer === legacyCustomer.id
            ? [createInvoice({ id: 'in_legacy', customer, created: 200 })]
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
        customerId: linkedCustomer.id,
        billingEmail: 'legacy@example.com'
      })
    };
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.currentPlan, 'pro');
    assert.equal(res.body.portalLinked, true);
    assert.equal(res.body.statusSource, 'portal_linked');
    assert.equal(res.body.legacyNeedsLinking, false);
    assert.equal(res.body.hasInvoiceHistory, true);
    assert.equal(res.body.autoLinkedLegacy, true);
    assert.deepEqual(res.body.activeSubscriptions, [
      {
        id: 'sub_legacy',
        status: 'active',
        plan: 'pro',
        priceId: 'price_pro'
      }
    ]);
  });

  it('auto-links a single legacy active subscription over a linked customer with invoice history but no active plan', async () => {
    const auth = await createBillingAuth({
      alias: 'legacy@3dvr'
    });
    const linkedCustomer = createPortalLinkedCustomer(auth, {
      id: 'cus_linked',
      email: 'legacy@example.com',
      created: 50
    });
    const legacyCustomer = createLegacyCustomer({
      id: 'cus_legacy',
      email: 'legacy@example.com',
      created: 10
    });
    const customerMocks = createStatefulCustomerMocks([linkedCustomer, legacyCustomer]);
    const stripe = createMockStripe({
      customers: customerMocks.customers,
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
      },
      invoices: {
        list: mock.fn(async ({ customer }) => ({
          data: customer === linkedCustomer.id
            ? [createInvoice({ id: 'in_linked', customer, created: 75 })]
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
        customerId: linkedCustomer.id,
        billingEmail: 'legacy@example.com'
      })
    };
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.currentPlan, 'starter');
    assert.equal(res.body.portalLinked, true);
    assert.equal(res.body.legacyNeedsLinking, false);
    assert.equal(res.body.autoLinkedLegacy, true);
    assert.equal(res.body.customerId, legacyCustomer.id);
    assert.equal(customerMocks.store.find(customer => customer.id === linkedCustomer.id)?.metadata?.canonical_customer_id, legacyCustomer.id);
  });

  it('auto-links a single legacy invoice-history customer when only an empty linked customer exists', async () => {
    const auth = await createBillingAuth({
      alias: 'legacy@3dvr'
    });
    const linkedCustomer = createPortalLinkedCustomer(auth, {
      id: 'cus_linked',
      email: 'legacy@example.com',
      created: 50
    });
    const legacyCustomer = createLegacyCustomer({
      id: 'cus_legacy',
      email: 'legacy@example.com',
      created: 10
    });
    const customerMocks = createStatefulCustomerMocks([linkedCustomer, legacyCustomer]);
    const stripe = createMockStripe({
      customers: customerMocks.customers,
      invoices: {
        list: mock.fn(async ({ customer }) => ({
          data: customer === legacyCustomer.id
            ? [createInvoice({ id: 'in_legacy', customer, created: 200 })]
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
        customerId: linkedCustomer.id,
        billingEmail: 'legacy@example.com'
      })
    };
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.currentPlan, 'free');
    assert.equal(res.body.portalLinked, true);
    assert.equal(res.body.statusSource, 'portal_linked');
    assert.equal(res.body.legacyNeedsLinking, false);
    assert.equal(res.body.hasInvoiceHistory, true);
    assert.equal(res.body.autoLinkedLegacy, true);
    assert.deepEqual(res.body.activeSubscriptions, []);
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

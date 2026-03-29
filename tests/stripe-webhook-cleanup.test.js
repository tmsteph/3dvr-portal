import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { createStripeWebhookHandler } from '../api/webhooks/stripe.js';
import { cancelRedundantBillingSubscriptions } from '../src/billing/stripe.js';

const baseConfig = {
  STRIPE_SECRET_KEY: 'sk_test_key',
  STRIPE_WEBHOOK_SECRET: 'whsec_test',
  STRIPE_PRICE_STARTER_ID: 'price_starter',
  STRIPE_PRICE_PRO_ID: 'price_pro',
  STRIPE_PRICE_BUILDER_ID: 'price_builder',
  PORTAL_ORIGIN: 'https://portal.3dvr.tech'
};

function createSubscription({
  id,
  customer,
  plan,
  priceId,
  created = 1,
  status = 'active',
  metadata = {}
} = {}) {
  return {
    id,
    customer,
    created,
    status,
    metadata,
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

function createCustomer({
  id,
  email,
  created = 1,
  metadata = {}
} = {}) {
  return {
    id,
    email,
    created,
    metadata: {
      ...metadata
    }
  };
}

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
    send(payload) {
      this.body = payload;
      return this;
    },
    setHeader(key, value) {
      this.headers[key] = value;
    }
  };
}

function createStripeState({
  customers = [],
  subscriptionsByCustomer = {}
} = {}) {
  const customerStore = customers.map(customer => ({
    ...customer,
    metadata: {
      ...(customer.metadata || {})
    }
  }));

  const subscriptionsStore = new Map(
    Object.entries(subscriptionsByCustomer).map(([customerId, subscriptions]) => ([
      customerId,
      subscriptions.map(subscription => ({
        ...subscription,
        metadata: {
          ...(subscription.metadata || {})
        }
      }))
    ]))
  );

  function cloneCustomer(customer) {
    return {
      ...customer,
      metadata: {
        ...(customer.metadata || {})
      }
    };
  }

  function cloneSubscription(subscription) {
    return {
      ...subscription,
      metadata: {
        ...(subscription.metadata || {})
      },
      items: {
        data: (subscription.items?.data || []).map(item => ({
          ...item,
          price: {
            ...(item.price || {}),
            metadata: {
              ...((item.price && item.price.metadata) || {})
            }
          }
        }))
      }
    };
  }

  const stripe = {
    customers: {
      retrieve: mock.fn(async customerId => {
        const customer = customerStore.find(item => item.id === customerId);
        if (!customer) {
          throw new Error('not found');
        }
        return cloneCustomer(customer);
      }),
      list: mock.fn(async ({ email } = {}) => ({
        data: customerStore
          .filter(customer => !email || customer.email === email)
          .map(cloneCustomer)
      })),
      update: mock.fn(async (customerId, patch = {}) => {
        const index = customerStore.findIndex(item => item.id === customerId);
        const existing = index >= 0
          ? customerStore[index]
          : createCustomer({ id: customerId, email: '', metadata: {} });
        const updated = {
          ...existing,
          ...patch,
          metadata: {
            ...(existing.metadata || {}),
            ...(patch.metadata || {})
          }
        };
        if (index >= 0) {
          customerStore[index] = updated;
        } else {
          customerStore.push(updated);
        }
        return cloneCustomer(updated);
      }),
      search: mock.fn(async ({ query } = {}) => {
        const keyMatch = /metadata\['([^']+)'\]/.exec(String(query || ''));
        const valueMatch = /:'([^']*)'/.exec(String(query || ''));
        const key = keyMatch?.[1] || '';
        const value = valueMatch?.[1] || '';

        return {
          data: customerStore
            .filter(customer => String(customer.metadata?.[key] || '') === value)
            .map(cloneCustomer)
        };
      })
    },
    subscriptions: {
      list: mock.fn(async ({ customer } = {}) => ({
        data: (subscriptionsStore.get(customer) || []).map(cloneSubscription)
      })),
      cancel: mock.fn(async subscriptionId => {
        for (const [customerId, subscriptions] of subscriptionsStore.entries()) {
          const nextSubscriptions = subscriptions.map(subscription => {
            if (subscription.id !== subscriptionId) {
              return subscription;
            }
            return {
              ...subscription,
              status: 'canceled'
            };
          });
          subscriptionsStore.set(customerId, nextSubscriptions);
        }

        return {
          id: subscriptionId,
          status: 'canceled'
        };
      })
    },
    invoices: {
      list: mock.fn(async () => ({ data: [] }))
    },
    webhooks: {
      constructEvent: mock.fn()
    }
  };

  return {
    stripe,
    customerStore,
    subscriptionsStore
  };
}

test('cancelRedundantBillingSubscriptions keeps the requested subscription across legacy customer records', async () => {
  const state = createStripeState({
    customers: [
      createCustomer({
        id: 'cus_new',
        email: 'member@example.com'
      }),
      createCustomer({
        id: 'cus_old',
        email: 'member@example.com'
      })
    ],
    subscriptionsByCustomer: {
      cus_new: [
        createSubscription({
          id: 'sub_new_pro',
          customer: 'cus_new',
          plan: 'pro',
          priceId: 'price_pro',
          created: 2
        })
      ],
      cus_old: [
        createSubscription({
          id: 'sub_old_builder',
          customer: 'cus_old',
          plan: 'builder',
          priceId: 'price_builder',
          created: 99
        })
      ]
    }
  });

  const result = await cancelRedundantBillingSubscriptions({
    stripeClient: state.stripe,
    customerId: 'cus_new',
    billingEmail: 'member@example.com',
    portalAlias: 'member@3dvr',
    portalPub: 'pub_member',
    keepSubscriptionId: 'sub_new_pro',
    config: baseConfig
  });

  assert.equal(result.keptSubscriptionId, 'sub_new_pro');
  assert.equal(result.canceledCount, 1);
  assert.deepEqual(result.cancelledSubscriptionIds, ['sub_old_builder']);
  assert.equal(result.autoLinkedLegacy, true);
  assert.equal(state.stripe.subscriptions.cancel.mock.calls.length, 1);
  assert.equal(state.stripe.subscriptions.cancel.mock.calls[0].arguments[0], 'sub_old_builder');

  const claimedCustomer = state.customerStore.find(customer => customer.id === 'cus_new');
  assert.equal(claimedCustomer.metadata.portal_pub, 'pub_member');
  assert.equal(claimedCustomer.metadata.portal_alias, 'member@3dvr');
});

test('stripe webhook cleanup keeps the updated subscription and cancels older managed plans', async () => {
  const state = createStripeState({
    customers: [
      createCustomer({
        id: 'cus_new',
        email: 'member@example.com'
      }),
      createCustomer({
        id: 'cus_old',
        email: 'member@example.com'
      })
    ],
    subscriptionsByCustomer: {
      cus_new: [
        createSubscription({
          id: 'sub_new_pro',
          customer: 'cus_new',
          plan: 'pro',
          priceId: 'price_pro',
          created: 2,
          metadata: {
            billing_email: 'member@example.com',
            portal_alias: 'member@3dvr',
            portal_pub: 'pub_member'
          }
        })
      ],
      cus_old: [
        createSubscription({
          id: 'sub_old_builder',
          customer: 'cus_old',
          plan: 'builder',
          priceId: 'price_builder',
          created: 99
        })
      ]
    }
  });

  const handler = createStripeWebhookHandler({
    stripeClient: state.stripe,
    config: {
      ...baseConfig,
      STRIPE_LOG_EMAIL: ''
    },
    transporter: null,
    readRawBody: async () => Buffer.from('{}'),
    constructEvent: () => ({
      id: 'evt_subscription_updated',
      type: 'customer.subscription.updated',
      created: 1700000000,
      data: {
        object: createSubscription({
          id: 'sub_new_pro',
          customer: 'cus_new',
          plan: 'pro',
          priceId: 'price_pro',
          created: 2,
          metadata: {
            billing_email: 'member@example.com',
            portal_alias: 'member@3dvr',
            portal_pub: 'pub_member'
          }
        })
      }
    })
  });

  const req = {
    method: 'POST',
    headers: {
      'stripe-signature': 'sig_test'
    }
  };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    received: true,
    cleanup: {
      canceledCount: 1,
      cancelledSubscriptionIds: ['sub_old_builder']
    }
  });
  assert.equal(state.stripe.subscriptions.cancel.mock.calls.length, 1);
  assert.equal(state.stripe.subscriptions.cancel.mock.calls[0].arguments[0], 'sub_old_builder');
});

test('stripe webhook sends one-time payment emails for payment-mode checkout sessions', async () => {
  const transporter = {
    sendMail: mock.fn(async payload => payload)
  };
  const handler = createStripeWebhookHandler({
    stripeClient: createStripeState().stripe,
    config: {
      ...baseConfig,
      GMAIL_USER: 'billing@3dvr.tech',
      STRIPE_LOG_EMAIL: ''
    },
    transporter,
    readRawBody: async () => Buffer.from('{}'),
    constructEvent: () => ({
      id: 'evt_checkout_payment',
      type: 'checkout.session.completed',
      created: 1700000000,
      data: {
        object: {
          id: 'cs_custom_payment',
          mode: 'payment',
          amount_total: 25000,
          currency: 'usd',
          customer: 'cus_new',
          customer_details: {
            email: 'client@example.com'
          },
          metadata: {
            plan: 'custom',
            billing_email: 'client@example.com',
            custom_label: 'Custom project deposit',
            custom_description: 'Scoped sprint deposit',
            custom_amount_cents: '25000'
          }
        }
      }
    })
  });

  const req = {
    method: 'POST',
    headers: {
      'stripe-signature': 'sig_test'
    }
  };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    received: true,
    cleanup: {
      canceledCount: 0,
      cancelledSubscriptionIds: []
    }
  });
  assert.equal(transporter.sendMail.mock.calls.length, 2);
  assert.deepEqual(transporter.sendMail.mock.calls.map(call => call.arguments[0].subject), [
    'Payment received: $250.00 for Custom project deposit',
    'One-Time Payment: client@example.com ($250.00)'
  ]);
  assert.match(transporter.sendMail.mock.calls[0].arguments[0].text, /\$250\.00/);
  assert.match(transporter.sendMail.mock.calls[0].arguments[0].text, /Custom project deposit/);
  assert.match(transporter.sendMail.mock.calls[0].arguments[0].text, /Scoped sprint deposit/);
  assert.match(transporter.sendMail.mock.calls[1].arguments[0].html, /Amount:<\/strong> \$250\.00/);
  assert.match(transporter.sendMail.mock.calls[1].arguments[0].html, /Reason:<\/strong> Custom project deposit/);
  assert.doesNotMatch(transporter.sendMail.mock.calls[0].arguments[0].subject, /Welcome to 3DVR\.Tech/);
  assert.doesNotMatch(transporter.sendMail.mock.calls[1].arguments[0].subject, /New Subscriber:/);
});

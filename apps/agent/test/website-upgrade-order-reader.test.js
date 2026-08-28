const test = require('node:test');
const assert = require('node:assert/strict');
const {
  listCompletedUpgradeOrders,
  normalizeHostedSiteUrl,
  sessionToUpgradeOrder,
} = require('../thomas-agent/node/website-upgrade-order-reader');

function paidSession(overrides = {}) {
  return {
    id: 'cs_live_upgrade_123',
    status: 'complete',
    payment_status: 'paid',
    amount_total: 9900,
    currency: 'usd',
    created: 123,
    customer_details: { email: 'buyer@example.com' },
    custom_fields: [
      { key: 'business_name', type: 'text', text: { value: 'Example Studio' } },
      { key: 'site_url', type: 'text', text: { value: 'https://www.3dvr.tech/free-sites/example-studio/' } },
      { key: 'main_action', type: 'text', text: { value: 'Book a consultation' } },
    ],
    ...overrides,
  };
}

test('normalizes a 3DVR-hosted free-site URL', () => {
  assert.deepEqual(normalizeHostedSiteUrl('https://www.3dvr.tech/free-sites/Example-Studio/'), {
    slug: 'example-studio',
    siteUrl: 'https://3dvr.tech/free-sites/example-studio/',
  });
});

test('rejects external sites from automatic fulfillment', () => {
  assert.throws(
    () => normalizeHostedSiteUrl('https://example.com/'),
    /only supports 3DVR-hosted free drafts/,
  );
});

test('turns a paid completed checkout into a bounded upgrade order', () => {
  assert.deepEqual(sessionToUpgradeOrder(paidSession()), {
    sessionId: 'cs_live_upgrade_123',
    businessName: 'Example Studio',
    mainAction: 'Book a consultation',
    siteUrl: 'https://3dvr.tech/free-sites/example-studio/',
    slug: 'example-studio',
    customerEmail: 'buyer@example.com',
    amountTotal: 9900,
    currency: 'usd',
    created: 123,
  });
});

test('ignores unpaid or incomplete sessions', () => {
  assert.equal(sessionToUpgradeOrder(paidSession({ payment_status: 'unpaid' })), null);
  assert.equal(sessionToUpgradeOrder(paidSession({ status: 'open' })), null);
});

test('lists eligible orders and separately reports blocked paid orders', async () => {
  const seen = {};
  const result = await listCompletedUpgradeOrders({
    env: { STRIPE_SECRET_KEY: 'sk_test_fake' },
    fetchImpl: async (url, init) => {
      seen.url = url;
      seen.authorization = init.headers.Authorization;
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            data: [
              paidSession(),
              paidSession({
                id: 'cs_live_external_456',
                custom_fields: [
                  { key: 'business_name', type: 'text', text: { value: 'External Business' } },
                  { key: 'site_url', type: 'text', text: { value: 'https://example.com/' } },
                  { key: 'main_action', type: 'text', text: { value: 'Call now' } },
                ],
              }),
            ],
          };
        },
      };
    },
  });

  assert.match(seen.url, /payment_link=plink_1U9JF6GiUl5dM378HHz6Ss5z/);
  assert.equal(seen.authorization, 'Bearer sk_test_fake');
  assert.equal(result.orders.length, 1);
  assert.equal(result.blocked.length, 1);
  assert.equal(result.blocked[0].sessionId, 'cs_live_external_456');
});

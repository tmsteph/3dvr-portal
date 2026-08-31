import assert from 'node:assert/strict';
import test from 'node:test';
import { createAvFreelanceKitHandler } from '../src/av-freelance-kit.js';

function response() {
  return {
    headers: {},
    statusCode: 200,
    body: '',
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    send(body) { this.body = body; return this; },
    json(body) { this.body = body; return this; }
  };
}

function stripeSession(overrides = {}) {
  return {
    status: 'complete',
    payment_status: 'paid',
    payment_link: 'plink_test_kit',
    metadata: { offer: 'av_freelancer_starter_kit' },
    ...overrides
  };
}

async function request(session, query = { session_id: 'cs_test_paid_1' }) {
  const stripeClient = { checkout: { sessions: { retrieve: async () => session } } };
  const handler = createAvFreelanceKitHandler({
    stripeClient,
    config: { STRIPE_AV_FREELANCER_KIT_PAYMENT_LINK_ID: 'plink_test_kit' }
  });
  const res = response();
  await handler({ method: 'GET', query }, res);
  return res;
}

test('paid kit checkout unlocks immediate downloads from a verified session URL', async () => {
  const res = await request(stripeSession());
  assert.equal(res.statusCode, 200);
  assert.match(res.body, /Payment verified/);
  assert.match(res.body, /asset=rate-card/);
  assert.match(res.body, /asset=outreach/);
  assert.match(res.body, /asset=show-day/);
  assert.equal(res.headers['Cache-Control'], 'private, no-store, max-age=0');
});

test('kit fulfillment rejects unpaid sessions and sessions for another offer', async () => {
  const unpaid = await request(stripeSession({ payment_status: 'unpaid' }));
  assert.equal(unpaid.statusCode, 403);

  const wrongOffer = await request(stripeSession({ metadata: { offer: 'website-upgrade' } }));
  assert.equal(wrongOffer.statusCode, 403);
});

test('kit assets remain behind the same paid checkout verification', async () => {
  const res = await request(stripeSession(), { session_id: 'cs_test_paid_1', asset: 'rate-card' });
  assert.equal(res.statusCode, 200);
  assert.match(res.headers['Content-Disposition'], /3dvr-av-freelancer-rate-card\.csv/);
  assert.match(res.body, /Target day rate/);
});

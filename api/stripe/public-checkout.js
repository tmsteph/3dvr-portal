import {
  getRequestOrigin,
  makeStripeClient,
  setCorsHeaders
} from '../../src/billing/stripe.js';
import {
  getBillingPlan,
  normalizeBillingPlan,
  resolveConfiguredPriceId
} from '../../src/billing/plans.js';

const PUBLIC_SUBSCRIPTION_PLANS = new Set(['starter', 'pro', 'builder', 'embedded']);

function readBody(req) {
  if (req?.body && typeof req.body === 'object') {
    return req.body;
  }

  if (typeof req?.body === 'string') {
    return Object.fromEntries(new URLSearchParams(req.body));
  }

  return {};
}

function requestWantsJson(req) {
  const contentType = String(req?.headers?.['content-type'] || '').toLowerCase();
  const accept = String(req?.headers?.accept || '').toLowerCase();
  return contentType.includes('application/json') || accept.includes('application/json');
}

export function createPublicStripeCheckoutHandler(options = {}) {
  const config = options.config || process.env;
  const stripeClient = options.stripeClient || makeStripeClient(config);

  return async function handler(req, res) {
    setCorsHeaders(res);

    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST, OPTIONS');
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    if (!stripeClient?.checkout?.sessions?.create) {
      return res.status(500).json({ error: 'Stripe is not configured on the server.' });
    }

    const plan = normalizeBillingPlan(readBody(req).plan);
    if (!PUBLIC_SUBSCRIPTION_PLANS.has(plan)) {
      return res.status(400).json({ error: 'Choose a valid monthly plan.' });
    }

    const priceId = resolveConfiguredPriceId(plan, config);
    if (!priceId) {
      return res.status(503).json({ error: `${getBillingPlan(plan)?.label || 'This plan'} is not available yet.` });
    }

    const origin = getRequestOrigin(req, config);
    const metadata = {
      plan,
      checkout_source: 'public_pay_v1'
    };

    try {
      const session = await stripeClient.checkout.sessions.create({
        mode: 'subscription',
        allow_promotion_codes: true,
        line_items: [
          {
            price: priceId,
            quantity: 1
          }
        ],
        metadata,
        subscription_data: {
          metadata
        },
        success_url: `${origin}/pay/?checkout=success&plan=${encodeURIComponent(plan)}`,
        cancel_url: `${origin}/pay/?checkout=cancel&plan=${encodeURIComponent(plan)}`
      });

      if (!session?.url) {
        return res.status(502).json({ error: 'Stripe did not return a checkout URL.' });
      }

      if (requestWantsJson(req)) {
        return res.status(200).json({
          flow: 'public_checkout',
          plan,
          url: session.url
        });
      }

      res.statusCode = 303;
      res.setHeader('Location', session.url);
      return res.end();
    } catch (error) {
      console.error('Unable to create public Stripe checkout session', error);
      return res.status(500).json({ error: 'Unable to open Stripe checkout right now.' });
    }
  };
}

export default createPublicStripeCheckoutHandler();

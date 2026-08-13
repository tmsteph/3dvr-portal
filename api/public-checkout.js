import {
  getRequestOrigin,
  makeStripeClient,
  requireConfiguredPlanPrice,
  setCorsHeaders
} from '../src/billing/stripe.js';
import { getBillingPlan, normalizeBillingPlan } from '../src/billing/plans.js';

const PUBLIC_CHECKOUT_PLANS = new Set(['starter', 'pro', 'builder', 'embedded']);

function readBody(req) {
  return req?.body && typeof req.body === 'object' ? req.body : {};
}

export function buildPublicCheckoutSessionPayload({ plan, priceId, origin } = {}) {
  const normalizedPlan = normalizeBillingPlan(plan);
  const base = String(origin || 'https://portal.3dvr.tech').trim().replace(/\/+$/, '');
  const metadata = {
    plan: normalizedPlan,
    checkout_path: 'public',
    source: 'portal-start'
  };

  return {
    mode: 'subscription',
    allow_promotion_codes: true,
    billing_address_collection: 'auto',
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
    success_url: `${base}/start/?checkout=success&plan=${encodeURIComponent(normalizedPlan)}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/start/?checkout=cancel&plan=${encodeURIComponent(normalizedPlan)}`
  };
}

export function createPublicCheckoutHandler(options = {}) {
  const config = options.config || process.env;
  const stripeClient = options.stripeClient || makeStripeClient(config);

  return async function handler(req, res) {
    setCorsHeaders(res);

    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    if (req.method === 'GET') {
      return res.status(200).json({
        stripeConfigured: Boolean(config.STRIPE_SECRET_KEY),
        plans: Array.from(PUBLIC_CHECKOUT_PLANS).map(plan => ({
          plan,
          label: getBillingPlan(plan)?.label || plan,
          amountLabel: getBillingPlan(plan)?.amountLabel || '',
          configured: Boolean(
            (() => {
              try {
                return requireConfiguredPlanPrice(plan, config);
              } catch (error) {
                return '';
              }
            })()
          )
        }))
      });
    }

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST, OPTIONS');
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    if (!stripeClient?.checkout?.sessions?.create) {
      return res.status(500).json({ error: 'Stripe is not configured on the server.' });
    }

    const body = readBody(req);
    const plan = normalizeBillingPlan(body.plan);
    if (!PUBLIC_CHECKOUT_PLANS.has(plan)) {
      return res.status(400).json({ error: 'Choose a valid public plan.' });
    }

    let priceId = '';
    try {
      priceId = requireConfiguredPlanPrice(plan, config);
    } catch (error) {
      return res.status(503).json({ error: 'This plan is not ready for checkout yet.' });
    }

    try {
      const session = await stripeClient.checkout.sessions.create(
        buildPublicCheckoutSessionPayload({
          plan,
          priceId,
          origin: getRequestOrigin(req, config)
        })
      );

      return res.status(200).json({
        id: session.id,
        url: session.url,
        plan
      });
    } catch (error) {
      console.error('Failed to create public Stripe checkout', error);
      return res.status(500).json({ error: 'Unable to start Stripe checkout.' });
    }
  };
}

export default createPublicCheckoutHandler();

import {
  buildStatusPayload,
  getRequestOrigin,
  listBillingSubscriptions,
  makeStripeClient,
  pickCurrentBillingSubscription,
  resolveLegacyStripeCustomerByEmail,
  resolvePortalLinkedStripeCustomer,
  setCorsHeaders
} from '../../src/billing/stripe.js';
import { verifyBillingAuthPayload } from '../../src/billing/auth.js';
import { isValidBillingEmail, normalizeBillingEmail } from '../../src/billing/plans.js';

function readPayload(req) {
  if (req.method === 'GET') {
    return req?.query && typeof req.query === 'object' ? req.query : {};
  }
  return req?.body && typeof req.body === 'object' ? req.body : {};
}

export function createStripeStatusHandler(options = {}) {
  const config = options.config || process.env;
  const stripeClient = options.stripeClient || makeStripeClient(config);

  return async function handler(req, res) {
    setCorsHeaders(res);

    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    if (!['GET', 'POST'].includes(req.method)) {
      res.setHeader('Allow', 'GET, POST, OPTIONS');
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    if (!stripeClient) {
      return res.status(500).json({ error: 'Stripe is not configured on the server.' });
    }

    const payload = readPayload(req);
    const origin = getRequestOrigin(req, config);
    const auth = await verifyBillingAuthPayload(payload, {
      config,
      expectedOrigin: origin
    });
    if (!auth.ok) {
      return res.status(401).json({ error: auth.reason });
    }

    const customerId = String(payload.customerId || '').trim();
    const portalAlias = auth.identity.alias || String(payload.portalAlias || '').trim();
    const portalPub = auth.identity.pub;
    const rawBillingEmail = String(payload.billingEmail || '').trim();
    const billingEmail = normalizeBillingEmail(rawBillingEmail);
    const requestedPortalPub = String(payload.portalPub || '').trim();

    if (requestedPortalPub && requestedPortalPub !== portalPub) {
      return res.status(403).json({ error: 'Billing access proof did not match this portal account.' });
    }

    if (rawBillingEmail && !isValidBillingEmail(rawBillingEmail)) {
      return res.status(400).json({ error: 'Enter a valid billing email address.' });
    }

    try {
      const customerResolution = await resolvePortalLinkedStripeCustomer({
        stripeClient,
        customerId,
        billingEmail,
        portalAlias,
        portalPub,
        createIfMissing: false
      });

      if (!customerResolution.customer) {
        const legacyResolution = await resolveLegacyStripeCustomerByEmail({
          stripeClient,
          billingEmail,
          config
        });

        if (legacyResolution.customer) {
          return res.status(200).json(buildStatusPayload({
            customer: legacyResolution.customer,
            current: legacyResolution.current,
            active: legacyResolution.active,
            duplicates: legacyResolution.duplicates,
            exposeCustomerId: false,
            portalLinked: false,
            statusSource: legacyResolution.source,
            legacyNeedsLinking: true
          }));
        }

        return res.status(200).json({
          ok: true,
          customerId: '',
          billingEmail,
          currentPlan: 'free',
          usageTier: 'account',
          portalLinked: false,
          statusSource: 'not_found',
          legacyNeedsLinking: false,
          activeSubscriptions: [],
          duplicateActiveCount: 0,
          hasDuplicateActiveSubscriptions: false
        });
      }

      const customer = customerResolution.customer;
      const subscriptions = await listBillingSubscriptions(stripeClient, customer.id);
      const billingState = pickCurrentBillingSubscription(subscriptions, config);

      return res.status(200).json(buildStatusPayload({
        customer,
        current: billingState.current,
        active: billingState.active,
        duplicates: billingState.duplicates
      }));
    } catch (error) {
      console.error('Failed to resolve Stripe billing status', error);
      return res.status(500).json({ error: error?.message || 'Unable to resolve billing status.' });
    }
  };
}

const handler = createStripeStatusHandler();
export default handler;

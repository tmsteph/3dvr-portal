import {
  buildCheckoutSessionPayload,
  buildCustomPaymentSessionPayload,
  buildStatusPayload,
  buildSubscriptionUpdateFlow,
  buildBillingUrls,
  compareBillingCustomerRecords,
  combineBillingCustomerRecords,
  getRequestOrigin,
  makeStripeClient,
  requireConfiguredPlanPrice,
  resolveLegacyStripeCustomerByEmail,
  resolvePortalLinkedStripeCustomer,
  resolvePlanDiagnostics,
  summarizeBillingCustomerRecord,
  setCorsHeaders
} from '../../src/billing/stripe.js';
import { verifyBillingAuthPayload } from '../../src/billing/auth.js';
import {
  getBillingPlan,
  isValidBillingEmail,
  normalizeBillingEmail,
  normalizeBillingPlan,
  normalizeCustomAmount
} from '../../src/billing/plans.js';

function readBody(req) {
  return req?.body && typeof req.body === 'object' ? req.body : {};
}

export function createStripeCheckoutHandler(options = {}) {
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
        planPricesConfigured: resolvePlanDiagnostics(config),
        customerPortalLoginConfigured: Boolean(config.STRIPE_CUSTOMER_PORTAL_LOGIN_URL)
      });
    }

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST, OPTIONS');
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    if (!stripeClient) {
      return res.status(500).json({ error: 'Stripe is not configured on the server.' });
    }

    const body = readBody(req);
    const action = String(body.action || 'subscribe').trim().toLowerCase();
    const plan = normalizeBillingPlan(body.plan);
    const rawBillingEmail = String(body.billingEmail || '').trim();
    const billingEmail = normalizeBillingEmail(rawBillingEmail);
    const customerId = String(body.customerId || '').trim();
    const requestedPortalAlias = String(body.portalAlias || '').trim();
    const requestedPortalPub = String(body.portalPub || '').trim();
    const customLabel = String(body.customLabel || '').trim();
    const customDescription = String(body.customDescription || '').trim();
    const customAmountCents = normalizeCustomAmount(body.customAmount);
    const origin = getRequestOrigin(req, config);
    const billingUrls = buildBillingUrls({ origin, plan });

    if (!['subscribe', 'manage'].includes(action)) {
      return res.status(400).json({ error: 'action must be subscribe or manage.' });
    }

    if (action === 'subscribe' && !plan) {
      return res.status(400).json({ error: 'A valid plan is required.' });
    }

    if (action === 'subscribe' && plan === 'custom' && !customAmountCents) {
      return res.status(400).json({ error: 'A custom one-time amount is required.' });
    }

    const auth = await verifyBillingAuthPayload(body, {
      config,
      expectedOrigin: origin
    });
    if (!auth.ok) {
      return res.status(401).json({ error: auth.reason });
    }

    const portalPub = auth.identity.pub;
    const portalAlias = auth.identity.alias || requestedPortalAlias;
    if (requestedPortalPub && requestedPortalPub !== portalPub) {
      return res.status(403).json({ error: 'Billing access proof did not match this portal account.' });
    }

    if (rawBillingEmail && !isValidBillingEmail(rawBillingEmail)) {
      return res.status(400).json({ error: 'Enter a valid billing email address.' });
    }

    try {
      let customerResolution = await resolvePortalLinkedStripeCustomer({
        stripeClient,
        customerId,
        billingEmail,
        portalAlias,
        portalPub,
        createIfMissing: false,
        config
      });
      let linkedState = combineBillingCustomerRecords(customerResolution.records || []);
      let linkedRecord = linkedState.primary
        || await summarizeBillingCustomerRecord(stripeClient, customerResolution.customer, config);
      const legacyResolution = await resolveLegacyStripeCustomerByEmail({
        stripeClient,
        billingEmail,
        config
      });
      const legacyState = combineBillingCustomerRecords(legacyResolution.records || []);
      const legacyRecord = legacyState.primary || null;
      const shouldPreferLegacy = Boolean(
        legacyResolution.customer
        && legacyRecord
        && (
          !linkedRecord
          || compareBillingCustomerRecords(legacyRecord, linkedRecord) < 0
        )
      );

      if (shouldPreferLegacy && action === 'manage') {
        if (stripeClient.billingPortal?.sessions?.create) {
          const portalSession = await stripeClient.billingPortal.sessions.create({
            customer: legacyResolution.customer.id,
            return_url: billingUrls.portalReturnUrl
          });

          return res.status(200).json({
            ...buildStatusPayload({
              customer: legacyResolution.customer,
              current: legacyResolution.current,
              active: legacyResolution.active,
              duplicates: legacyResolution.duplicates,
              exposeCustomerId: false,
              portalLinked: false,
              statusSource: legacyResolution.source,
              legacyNeedsLinking: true,
              hasInvoiceHistory: legacyResolution.hasInvoiceHistory,
              legacyBillingManagementAvailable: true
            }),
            flow: 'legacy_portal_manage',
            url: portalSession.url
          });
        }

        return res.status(500).json({ error: 'Stripe Billing Portal is not configured.' });
      }

      if (shouldPreferLegacy && legacyResolution.current) {
        const legacyConflictMessage = legacyResolution.matchCount > 1
          ? 'We found multiple older Stripe subscriptions for this billing email, and they are not linked to this portal account yet. To avoid creating another duplicate subscription, do not start a new plan here yet.'
          : 'We found an older Stripe subscription for this billing email, but it is not linked to this portal account yet. To avoid creating a duplicate subscription, do not start a new plan here yet.';

        return res.status(409).json({
          ...buildStatusPayload({
            customer: legacyResolution.customer,
            current: legacyResolution.current,
            active: legacyResolution.active,
            duplicates: legacyResolution.duplicates,
            exposeCustomerId: false,
            portalLinked: false,
            statusSource: legacyResolution.source,
            legacyNeedsLinking: true,
            hasInvoiceHistory: legacyResolution.hasInvoiceHistory,
            legacyBillingManagementAvailable: true
          }),
          error: legacyConflictMessage
        });
      }

      if (!customerResolution.customer && action === 'subscribe') {
        customerResolution = await resolvePortalLinkedStripeCustomer({
          stripeClient,
          customerId,
          billingEmail,
          portalAlias,
          portalPub,
          createIfMissing: true,
          config
        });
        linkedState = combineBillingCustomerRecords(customerResolution.records || []);
        linkedRecord = linkedState.primary
          || await summarizeBillingCustomerRecord(stripeClient, customerResolution.customer, config);
      }

      const customer = customerResolution.customer;
      if (!customer) {
        return res.status(409).json({
          error: action === 'manage'
            ? 'No portal-linked paid billing record was found for this signed-in account yet. Choose a plan below to start, or use your Stripe receipt link if this subscription predates portal linking.'
            : 'We could not match this request to a Stripe customer yet. Confirm the billing email and try again.'
        });
      }

      const current = linkedState.current || linkedRecord?.current || null;
      const active = linkedState.active.length ? linkedState.active : linkedRecord?.active || [];
      const duplicates = linkedState.active.length ? linkedState.duplicates : linkedRecord?.duplicates || [];
      const statusSource = linkedState.recordCount > 1 ? 'portal_linked_multi' : 'portal_linked';
      const hasInvoiceHistory = linkedState.recordCount ? linkedState.hasInvoiceHistory : linkedRecord?.hasInvoiceHistory;

      if (action === 'subscribe' && duplicates.length && current && current.plan !== plan) {
        return res.status(409).json({
          ...buildStatusPayload({
            customer,
            current,
            active,
            duplicates,
            statusSource,
            hasInvoiceHistory
          }),
          error: 'More than one active Stripe subscription is already associated with this account. Cancel the extra subscription before changing plans here.'
        });
      }

      if (action === 'manage') {
        if (stripeClient.billingPortal?.sessions?.create) {
          const portalSession = await stripeClient.billingPortal.sessions.create({
            customer: customer.id,
            return_url: billingUrls.portalReturnUrl
          });

          return res.status(200).json({
            ...buildStatusPayload({
              customer,
              current,
              active,
              duplicates,
              statusSource,
              hasInvoiceHistory
            }),
            flow: 'portal_manage',
            url: portalSession.url
          });
        }

        if (config.STRIPE_CUSTOMER_PORTAL_LOGIN_URL) {
          return res.status(200).json({
            ...buildStatusPayload({
              customer,
              current,
              active,
              duplicates,
              statusSource,
              hasInvoiceHistory
            }),
            flow: 'portal_login',
            url: String(config.STRIPE_CUSTOMER_PORTAL_LOGIN_URL).trim()
          });
        }

        return res.status(500).json({ error: 'Stripe Billing Portal is not configured.' });
      }

      if (plan === 'custom') {
        const paymentSession = await stripeClient.checkout.sessions.create(
          buildCustomPaymentSessionPayload({
            customer,
            amountCents: customAmountCents,
            label: customLabel || 'Custom Project Payment',
            description: customDescription,
            origin,
            portalAlias,
            portalPub,
            billingEmail
          })
        );

        return res.status(200).json({
          ...buildStatusPayload({ customer, current, active, duplicates, statusSource, hasInvoiceHistory }),
          flow: 'checkout_payment',
          url: paymentSession.url
        });
      }

      const targetPriceId = requireConfiguredPlanPrice(plan, config);
      if (current?.plan === plan) {
        const portalSession = await stripeClient.billingPortal.sessions.create({
          customer: customer.id,
          return_url: billingUrls.portalReturnUrl
        });

        return res.status(200).json({
          ...buildStatusPayload({ customer, current, active, duplicates, statusSource, hasInvoiceHistory }),
          flow: 'already_subscribed',
          url: portalSession.url
        });
      }

      if (current) {
        const portalSession = await stripeClient.billingPortal.sessions.create(
          buildSubscriptionUpdateFlow({
            subscription: current,
            nextPriceId: targetPriceId,
            returnUrl: billingUrls.portalReturnUrl,
            successUrl: billingUrls.portalSuccessUrl
          })
        );

        return res.status(200).json({
          ...buildStatusPayload({ customer, current, active, duplicates, statusSource, hasInvoiceHistory }),
          flow: 'portal_update',
          targetPlan: getBillingPlan(plan)?.label || plan,
          url: portalSession.url
        });
      }

      const checkoutSession = await stripeClient.checkout.sessions.create(
        buildCheckoutSessionPayload({
          customer,
          plan,
          priceId: targetPriceId,
          origin,
          portalAlias,
          portalPub,
          billingEmail
        })
      );

      return res.status(200).json({
        ...buildStatusPayload({ customer, current, active, duplicates, statusSource, hasInvoiceHistory }),
        flow: 'checkout_subscription',
        targetPlan: getBillingPlan(plan)?.label || plan,
        url: checkoutSession.url
      });
    } catch (error) {
      console.error('Stripe checkout routing failed', error);
      return res.status(500).json({ error: error?.message || 'Unable to start Stripe checkout.' });
    }
  };
}

const handler = createStripeCheckoutHandler();
export default handler;

import { verifyBillingAuthPayload } from './auth.js';
import { getRequestOrigin, makeStripeClient, setCorsHeaders } from './stripe.js';
import { isValidBillingEmail, normalizeBillingEmail, normalizeCustomAmount } from './plans.js';

function cleanText(value, limit) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, limit);
}

export function buildOperatorPaymentSessionPayload({
  amountCents,
  customerEmail,
  customerName,
  description,
  reference,
  quoteId,
  crmRecordId,
  collectCustomerEmail = false,
  collectMissingFields = false,
  origin
}) {
  const sessionDescription = description || 'Custom 3DVR payment';
  const metadata = {
    payment_source: 'custom-payment',
    customer_name: customerName,
    customer_email: customerEmail,
    reference,
    description,
    quote_id: quoteId,
    crm_record_id: crmRecordId
  };
  const compactMetadata = Object.fromEntries(
    Object.entries(metadata).filter(([, value]) => Boolean(value))
  );

  const payload = {
    mode: 'payment',
    customer_creation: 'always',
    billing_address_collection: 'auto',
    payment_intent_data: {
      description: sessionDescription,
      metadata: compactMetadata
    },
    line_items: [{
      quantity: 1,
      price_data: {
        currency: 'usd',
        unit_amount: amountCents,
        product_data: {
          name: sessionDescription,
          metadata: compactMetadata
        }
      }
    }],
    metadata: compactMetadata,
    success_url: `${origin}/custom-payment/?payment=success`,
    cancel_url: `${origin}/custom-payment/?payment=cancel`
  };

  if (!collectCustomerEmail) {
    payload.customer_email = customerEmail;
  }

  if (collectMissingFields) {
    const customFields = [];
    if (!customerName) {
      customFields.push({
        key: 'customer_name',
        label: { type: 'custom', custom: 'Your name' },
        type: 'text',
        optional: false
      });
    }
    if (!description) {
      customFields.push({
        key: 'payment_for',
        label: { type: 'custom', custom: 'What is this payment for?' },
        type: 'text',
        optional: false
      });
    }
    if (customFields.length) payload.custom_fields = customFields;
  }

  return payload;
}

export function createCustomPaymentHandler(options = {}) {
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
    if (!stripeClient) {
      return res.status(500).json({ error: 'Stripe is not configured on the server.' });
    }

    const body = req?.body && typeof req.body === 'object' ? req.body : {};
    const origin = getRequestOrigin(req, config);
    const auth = await verifyBillingAuthPayload(body, {
      config,
      expectedOrigin: origin
    });
    if (!auth.ok) {
      return res.status(401).json({ error: auth.reason });
    }

    const customerEmail = normalizeBillingEmail(body.customerEmail);
    const customerName = cleanText(body.customerName, 120);
    const description = cleanText(body.description, 120);
    const reference = cleanText(body.reference, 80);
    const quoteId = cleanText(body.quoteId, 100);
    const crmRecordId = cleanText(body.crmRecordId, 100);
    const collectCustomerEmail = body.collectCustomerEmail === true;
    const collectMissingFields = body.collectMissingFields === true;
    const amountCents = normalizeCustomAmount(body.amount);

    if (!collectMissingFields && !customerName) {
      return res.status(400).json({ error: 'Enter the customer name.' });
    }
    if (!collectCustomerEmail && !isValidBillingEmail(customerEmail)) {
      return res.status(400).json({ error: 'Enter a valid customer email.' });
    }
    if (!collectMissingFields && !description) {
      return res.status(400).json({ error: 'Enter what the payment is for.' });
    }
    if (!amountCents || amountCents < 100 || amountCents > 99999999) {
      return res.status(400).json({ error: 'Enter an amount from $1 to $999,999.99.' });
    }

    try {
      const session = await stripeClient.checkout.sessions.create(
        buildOperatorPaymentSessionPayload({
          amountCents,
          customerEmail,
          customerName,
          description,
          reference,
          quoteId,
          crmRecordId,
          collectCustomerEmail,
          collectMissingFields,
          origin
        })
      );

      return res.status(200).json({
        id: session.id,
        url: session.url
      });
    } catch (error) {
      console.error('Failed to create custom Stripe payment', error);
      return res.status(500).json({ error: 'Unable to create the payment link right now.' });
    }
  };
}

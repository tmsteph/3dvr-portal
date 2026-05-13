import Stripe from 'stripe';

const SAMPLE_PRODUCTS = Object.freeze({
  'compact-desk-dock': Object.freeze({
    name: 'Compact Desk Dock',
    description: 'A sample dropship product page for testing single-product demand.',
    unitAmount: 7900,
    currency: 'usd',
    image: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1200&q=80',
  }),
});

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function getOrigin(req, config = process.env) {
  const host = String(req?.headers?.['x-forwarded-host'] || req?.headers?.host || '').split(',')[0].trim();
  if (host) {
    const proto = String(req?.headers?.['x-forwarded-proto'] || '').split(',')[0].trim()
      || (host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https');
    return `${proto}://${host}`;
  }
  return String(config.PORTAL_ORIGIN || 'https://portal.3dvr.tech').replace(/\/+$/, '');
}

function getStripeClient(config = process.env) {
  const secretKey = String(config.STRIPE_SECRET_KEY || '').trim();
  if (!secretKey) return null;
  return new Stripe(secretKey, { apiVersion: '2023-10-16' });
}

async function readJsonBody(req) {
  if (req?.body && typeof req.body === 'object') return req.body;
  if (typeof req?.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }

  return new Promise(resolve => {
    let raw = '';
    req.on?.('data', chunk => {
      raw += chunk;
    });
    req.on?.('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
    req.on?.('error', () => resolve({}));
  });
}

function normalizeQuantity(value) {
  const quantity = Number.parseInt(value, 10);
  if (!Number.isFinite(quantity)) return 1;
  return Math.min(Math.max(quantity, 1), 5);
}

export function createStorefrontCheckoutHandler(options = {}) {
  const config = options.config || process.env;
  const stripe = options.stripeClient || getStripeClient(config);

  return async function handler(req, res) {
    setCorsHeaders(res);

    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    if (req.method === 'GET') {
      return res.status(200).json({
        stripeConfigured: Boolean(config.STRIPE_SECRET_KEY),
        products: Object.keys(SAMPLE_PRODUCTS),
      });
    }

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST, OPTIONS');
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    if (!stripe) {
      return res.status(500).json({ error: 'Stripe is not configured on the server.' });
    }

    const body = await readJsonBody(req);
    const productId = String(body.productId || '').trim();
    const product = SAMPLE_PRODUCTS[productId];
    const quantity = normalizeQuantity(body.quantity);
    const orderId = String(body.orderId || '').trim().slice(0, 80);
    const customerEmail = String(body.customerEmail || '').trim().toLowerCase();
    const customerName = String(body.customerName || '').trim().slice(0, 120);
    const origin = getOrigin(req, config);

    if (!product) {
      return res.status(400).json({ error: 'Unknown product.' });
    }

    if (!orderId) {
      return res.status(400).json({ error: 'Missing order id.' });
    }

    try {
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        success_url: `${origin}/victor-dropship/?checkout=success&order=${encodeURIComponent(orderId)}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/victor-dropship/?checkout=cancel&order=${encodeURIComponent(orderId)}`,
        customer_email: customerEmail || undefined,
        billing_address_collection: 'auto',
        shipping_address_collection: {
          allowed_countries: ['US'],
        },
        metadata: {
          storefront: 'victor-dropship-sample',
          order_id: orderId,
          product_id: productId,
          customer_name: customerName,
        },
        line_items: [
          {
            quantity,
            price_data: {
              currency: product.currency,
              unit_amount: product.unitAmount,
              product_data: {
                name: product.name,
                description: product.description,
                images: [product.image],
                metadata: {
                  product_id: productId,
                  fulfillment: 'manual-vendor-order',
                },
              },
            },
          },
        ],
      });

      return res.status(200).json({
        id: session.id,
        url: session.url,
      });
    } catch (error) {
      console.error('Unable to create sample storefront checkout', error);
      return res.status(500).json({ error: error?.message || 'Unable to open checkout.' });
    }
  };
}

const handler = createStorefrontCheckoutHandler();
export default handler;

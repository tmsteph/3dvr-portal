import {
  BUSINESS_CARD_PRODUCTS,
  MAX_ARTWORK_BYTES,
  addBusinessDays,
  decodeArtworkFile,
  publicBusinessCardProducts,
} from './business-card-products.js';

function firstHeaderValue(value = '') {
  return String(value || '').split(',')[0].trim();
}

function getRequestOrigin(req, config = process.env) {
  const host = firstHeaderValue(req?.headers?.['x-forwarded-host'] || req?.headers?.host || '');
  if (host) {
    const proto = firstHeaderValue(req?.headers?.['x-forwarded-proto'] || '').toLowerCase()
      || (host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https');
    return `${proto}://${host}`;
  }
  return String(config?.PORTAL_ORIGIN || 'https://portal.3dvr.tech').trim().replace(/\/+$/, '');
}

function cleanOrderId(value) {
  return String(value || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
}

export function getBusinessCardCheckoutConfig({
  stripeConfigured = false,
  artworkUploadConfigured = false,
  now = new Date(),
} = {}) {
  return {
    stripeConfigured: Boolean(stripeConfigured),
    artworkUploadConfigured: Boolean(artworkUploadConfigured),
    maxArtworkBytes: MAX_ARTWORK_BYTES,
    products: publicBusinessCardProducts(now),
  };
}

export function createBusinessCardOrderHandler(options = {}) {
  const config = options.config || process.env;
  const stripeClient = options.stripeClient || null;
  const mailTransport = options.mailTransport || null;
  const now = options.now || (() => new Date());

  return async function handleBusinessCardOrder(req, res) {
    if (!stripeClient) return res.status(503).json({ error: 'Secure checkout is not ready right now.' });
    if (!mailTransport || !config.GMAIL_USER || !config.GMAIL_APP_PASSWORD) {
      return res.status(503).json({ error: 'Artwork upload is not ready right now.' });
    }

    const body = req?.body && typeof req.body === 'object' ? req.body : {};
    const productId = String(body.productId || '').trim();
    const product = BUSINESS_CARD_PRODUCTS[productId];
    if (!product) return res.status(400).json({ error: 'Choose a valid card option.' });

    let files;
    try {
      files = Array.isArray(body.artwork) ? body.artwork.map(decodeArtworkFile) : [];
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }

    const frontFiles = files.filter(file => file.side === 'front');
    const backFiles = files.filter(file => file.side === 'back');
    if (!frontFiles.length) return res.status(400).json({ error: 'Upload the front of your card.' });
    if (frontFiles.length > 1 || backFiles.length > 1) {
      return res.status(400).json({ error: 'Upload one front file and, if needed, one back file.' });
    }

    const totalArtworkBytes = files.reduce((sum, file) => sum + file.size, 0);
    if (totalArtworkBytes > MAX_ARTWORK_BYTES) {
      return res.status(413).json({ error: 'Artwork is too large. Keep the front and back under 2.5 MB total.' });
    }

    const front = frontFiles[0];
    const back = backFiles[0];
    const generatedOrderId = `CARD-${Date.now().toString(36).toUpperCase()}`;
    const orderId = cleanOrderId(body.orderId) || generatedOrderId;
    const origin = getRequestOrigin(req, config);
    const estimatedReadyDate = addBusinessDays(now(), product.businessDays).toISOString().slice(0, 10);
    const metadata = {
      order_type: 'business-cards',
      order_id: orderId,
      product_id: product.id,
      quantity: String(product.quantity),
      quality: product.quality,
      sides: product.sides,
      estimated_ready_date: estimatedReadyDate,
      front_artwork: front.name,
      back_artwork: back?.name || '',
    };

    let session;
    try {
      session = await stripeClient.checkout.sessions.create({
        mode: 'payment',
        customer_creation: 'always',
        billing_address_collection: 'auto',
        shipping_address_collection: { allowed_countries: ['US'] },
        success_url: `${origin}/cards/?checkout=success&order=${encodeURIComponent(orderId)}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/cards/?checkout=cancel&order=${encodeURIComponent(orderId)}`,
        metadata,
        payment_intent_data: { metadata },
        line_items: [{
          quantity: 1,
          price_data: {
            currency: product.currency,
            unit_amount: product.priceCents,
            product_data: {
              name: product.name,
              description: `${product.sides} • ${product.quality}`,
              metadata: {
                product_id: product.id,
                quantity: String(product.quantity),
                quality: product.quality,
              },
            },
          },
        }],
      });

      const orderMailbox = String(config.BUSINESS_CARD_ORDER_EMAIL || config.GMAIL_USER || '').trim();
      await mailTransport.sendMail({
        from: `"3DVR Print Checkout" <${config.GMAIL_USER}>`,
        to: orderMailbox,
        replyTo: config.GMAIL_USER,
        subject: `Card checkout ${orderId} — ${product.quantity} / $${(product.priceCents / 100).toFixed(2)}`,
        text: [
          'A customer started a self-checkout for business cards.',
          '',
          `Order: ${orderId}`,
          `Stripe session: ${session.id}`,
          `Product: ${product.name}`,
          `Quality: ${product.quality}`,
          `Sides: ${product.sides}`,
          `Price: $${(product.priceCents / 100).toFixed(2)}`,
          `Estimated ready date: ${estimatedReadyDate}`,
          `Checkout: ${session.url}`,
          '',
          'Artwork is attached. Payment is not confirmed by this email; match the order ID/session in Stripe before production.',
        ].join('\n'),
        attachments: files.map(file => ({
          filename: `${file.side}-${file.name}`,
          content: file.content,
          contentType: file.type,
        })),
        headers: {
          'X-3DVR-Order-Type': 'business-cards',
          'X-3DVR-Order-Id': orderId,
          'X-3DVR-Stripe-Session': session.id,
        },
      });
    } catch (error) {
      if (session?.id && stripeClient.checkout?.sessions?.expire) {
        try { await stripeClient.checkout.sessions.expire(session.id); } catch {}
      }
      console.error('Failed to start business card checkout', error);
      return res.status(503).json({ error: 'Could not start checkout. Please try again.' });
    }

    return res.status(200).json({
      id: session.id,
      url: session.url,
      orderId,
      productId: product.id,
      estimatedReadyDate,
    });
  };
}

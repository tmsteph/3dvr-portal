import Stripe from 'stripe';

const stripeClient = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' })
  : null;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  if (!stripeClient) {
    return res.status(500).json({ error: 'Stripe is not configured on the server.' });
  }

  const defaultLimit = 5;
  const requestedLimit = Number.parseInt(req.query.limit, 10);
  const limit = Number.isNaN(requestedLimit) ? defaultLimit : requestedLimit;

  try {
    const events = await stripeClient.events.list({
      limit,
    });

    const payload = events.data.map(event => ({
      id: event.id,
      type: event.type,
      created: event.created,
      apiVersion: event.api_version || '',
      pendingWebhooks: typeof event.pending_webhooks === 'number' ? event.pending_webhooks : null,
      requestId: typeof event.request === 'string' ? event.request : event.request?.id || '',
      objectType: event.data?.object?.object || '',
    }));

    return res.status(200).json({
      events: payload,
      hasWebhookSecret: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
    });
  } catch (err) {
    console.error('Failed to list Stripe events', err);
    return res.status(500).json({ error: 'Unable to fetch Stripe events.' });
  }
}

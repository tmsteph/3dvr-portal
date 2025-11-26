import Stripe from 'stripe';

const stripeClient = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' })
  : null;

function summarizeBalances(entries) {
  if (!Array.isArray(entries)) {
    return {};
  }

  return entries.reduce((acc, entry) => {
    if (!entry || typeof entry.amount !== 'number' || !entry.currency) {
      return acc;
    }

    const currency = entry.currency.toUpperCase();
    acc[currency] = (acc[currency] || 0) + entry.amount;
    return acc;
  }, {});
}

async function listActiveSubscribers() {
  const subscriptions = stripeClient.subscriptions.list({
    status: 'active',
    limit: 100,
  });

  const allSubscriptions = await subscriptions.autoPagingToArray({ limit: 1000 });
  return allSubscriptions.length;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  if (!stripeClient) {
    return res.status(500).json({ error: 'Stripe is not configured on the server.' });
  }

  try {
    const [balance, activeSubscribers] = await Promise.all([
      stripeClient.balance.retrieve(),
      listActiveSubscribers(),
    ]);

    const availableTotals = summarizeBalances(balance.available);
    const pendingTotals = summarizeBalances(balance.pending);

    return res.status(200).json({
      available: availableTotals,
      pending: pendingTotals,
      activeSubscribers,
      hasMoreSubscribers: activeSubscribers >= 1000,
    });
  } catch (err) {
    console.error('Failed to fetch Stripe metrics', err);
    return res.status(500).json({ error: 'Unable to fetch Stripe metrics.' });
  }
}

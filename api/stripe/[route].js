import Stripe from 'stripe';

function makeStripeClient(config = process.env) {
  const secretKey = String(config?.STRIPE_SECRET_KEY || '').trim();
  if (!secretKey) {
    return null;
  }

  return new Stripe(secretKey, { apiVersion: '2023-10-16' });
}

function toMilliseconds(seconds) {
  if (!seconds) {
    return null;
  }

  try {
    return Number(seconds) * 1000;
  } catch (error) {
    return null;
  }
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function summarizeInvoices(invoices = []) {
  const totals = new Map();

  invoices.forEach(invoice => {
    if (!invoice) {
      return;
    }

    const customerId = typeof invoice.customer === 'string'
      ? invoice.customer
      : invoice.customer?.id;
    if (!customerId) {
      return;
    }

    const currency = String(invoice.currency || 'usd').toUpperCase();
    const amountPaid = typeof invoice.amount_paid === 'number' ? invoice.amount_paid : 0;
    const email = invoice.customer_email || invoice.customer?.email || '';
    const name = invoice.customer_name || invoice.customer?.name || '';
    const aggregateKey = normalizeEmail(email) || customerId;

    if (!aggregateKey) {
      return;
    }

    const existing = totals.get(aggregateKey) || {
      aggregateKey,
      customerIds: new Set(),
      currency,
      amountPaid: 0,
      invoiceCount: 0,
      email,
      name,
      lastInvoiceAt: null
    };

    existing.customerIds.add(customerId);
    existing.amountPaid += amountPaid;
    existing.invoiceCount += 1;
    existing.lastInvoiceAt = Math.max(existing.lastInvoiceAt || 0, toMilliseconds(invoice.created) || 0)
      || existing.lastInvoiceAt;

    if (email && !existing.email) {
      existing.email = email;
    }
    if (name && !existing.name) {
      existing.name = name;
    }
    if (!existing.currency) {
      existing.currency = currency;
    }

    totals.set(aggregateKey, existing);
  });

  return Array.from(totals.values())
    .map(entry => ({
      ...entry,
      customerIds: Array.from(entry.customerIds)
    }))
    .sort((a, b) => b.amountPaid - a.amountPaid);
}

function summarizeBalances(entries) {
  if (!Array.isArray(entries)) {
    return {};
  }

  return entries.reduce((acc, entry) => {
    if (!entry || typeof entry.amount !== 'number' || !entry.currency) {
      return acc;
    }

    const currency = String(entry.currency).toUpperCase();
    acc[currency] = (acc[currency] || 0) + entry.amount;
    return acc;
  }, {});
}

function getRouteValue(req) {
  const route = req?.query?.route;
  if (Array.isArray(route)) {
    return String(route[0] || '').trim().toLowerCase();
  }

  return String(route || '').trim().toLowerCase();
}

async function listCustomers(stripeClient, res) {
  const invoicesIterator = stripeClient.invoices.list({
    status: 'paid',
    limit: 100,
    expand: ['data.customer']
  });
  const invoices = await invoicesIterator.autoPagingToArray({ limit: 1000 });
  const customers = summarizeInvoices(invoices);

  const currencyTotals = customers.reduce((acc, customer) => {
    const currency = customer.currency || 'USD';
    acc[currency] = (acc[currency] || 0) + customer.amountPaid;
    return acc;
  }, {});

  return res.status(200).json({
    customers,
    count: customers.length,
    currencyTotals
  });
}

async function listMetrics(stripeClient, res) {
  const subscriptionsIterator = stripeClient.subscriptions.list({
    status: 'active',
    limit: 100
  });
  const allSubscriptions = await subscriptionsIterator.autoPagingToArray({ limit: 1000 });
  const balance = await stripeClient.balance.retrieve();

  return res.status(200).json({
    available: summarizeBalances(balance.available),
    pending: summarizeBalances(balance.pending),
    activeSubscribers: allSubscriptions.length,
    hasMoreSubscribers: allSubscriptions.length >= 1000
  });
}

async function listEvents(req, stripeClient, res, config = process.env) {
  const requestedLimit = Number.parseInt(req?.query?.limit, 10);
  const limit = Number.isNaN(requestedLimit) ? 5 : requestedLimit;
  const events = await stripeClient.events.list({ limit });

  return res.status(200).json({
    events: (events.data || []).map(event => ({
      id: event.id,
      type: event.type,
      created: event.created,
      apiVersion: event.api_version || '',
      pendingWebhooks: typeof event.pending_webhooks === 'number' ? event.pending_webhooks : null,
      requestId: typeof event.request === 'string' ? event.request : event.request?.id || '',
      objectType: event.data?.object?.object || ''
    })),
    hasWebhookSecret: Boolean(config?.STRIPE_WEBHOOK_SECRET)
  });
}

export function createStripeDashboardHandler({
  stripeClient = makeStripeClient(),
  config = process.env
} = {}) {
  return async function handler(req, res) {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    if (!stripeClient) {
      return res.status(500).json({ error: 'Stripe is not configured on the server.' });
    }

    const route = getRouteValue(req);

    try {
      if (route === 'customers') {
        return await listCustomers(stripeClient, res);
      }
      if (route === 'metrics') {
        return await listMetrics(stripeClient, res);
      }
      if (route === 'events') {
        return await listEvents(req, stripeClient, res, config);
      }

      return res.status(404).json({ error: `Unknown Stripe endpoint: ${route || 'missing'}` });
    } catch (error) {
      const routeLabel = route || 'unknown';
      console.error(`Failed to fetch Stripe ${routeLabel}`, error);
      return res.status(500).json({ error: `Unable to fetch Stripe ${routeLabel}.` });
    }
  };
}

export default createStripeDashboardHandler();

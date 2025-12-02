import Stripe from 'stripe';

const stripeClient = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' })
  : null;

function toMilliseconds(seconds) {
  if (!seconds) return null;
  try {
    return Number(seconds) * 1000;
  } catch (err) {
    return null;
  }
}

function normalizeEmail(email) {
  return (email || '').trim().toLowerCase();
}

function summarizeInvoices(invoices) {
  const totals = new Map();

  invoices.forEach(invoice => {
    if (!invoice) return;
    const customerId = typeof invoice.customer === 'string'
      ? invoice.customer
      : invoice.customer?.id;
    if (!customerId) return;

    const currency = (invoice.currency || 'usd').toUpperCase();
    const amountPaid = typeof invoice.amount_paid === 'number' ? invoice.amount_paid : 0;
    const email = invoice.customer_email || invoice.customer?.email || '';
    const name = invoice.customer_name || invoice.customer?.name || '';
    const aggregateKey = normalizeEmail(email) || customerId;

    if (!aggregateKey) return;

    const existing = totals.get(aggregateKey) || {
      aggregateKey,
      customerIds: new Set(),
      currency,
      amountPaid: 0,
      invoiceCount: 0,
      email,
      name,
      lastInvoiceAt: null,
    };

    existing.customerIds.add(customerId);
    existing.amountPaid += amountPaid;
    existing.invoiceCount += 1;
    existing.lastInvoiceAt = Math.max(existing.lastInvoiceAt || 0, toMilliseconds(invoice.created) || 0) || existing.lastInvoiceAt;

    if (email && !existing.email) existing.email = email;
    if (name && !existing.name) existing.name = name;
    if (!existing.currency) existing.currency = currency;
    totals.set(aggregateKey, existing);
  });

  return Array.from(totals.values())
    .map(entry => ({
      ...entry,
      customerIds: Array.from(entry.customerIds),
    }))
    .sort((a, b) => b.amountPaid - a.amountPaid);
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
    const invoicesIterator = stripeClient.invoices.list({
      status: 'paid',
      limit: 100,
      expand: ['data.customer'],
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
      currencyTotals,
    });
  } catch (err) {
    console.error('Failed to fetch Stripe customers', err);
    return res.status(500).json({ error: 'Unable to fetch Stripe customers.' });
  }
}

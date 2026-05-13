import Stripe from 'stripe';
import { resolvePlanFromSubscription } from '../../src/money/access.js';
import { createStripeCheckoutHandler } from '../../src/billing/api-checkout.js';
import { createStripeStatusHandler } from '../../src/billing/api-status.js';

const SAMPLE_STOREFRONT_PRODUCTS = Object.freeze({
  'compact-desk-dock': Object.freeze({
    name: 'Compact Desk Dock',
    description: 'A low-profile docking stand for a cleaner laptop workspace.',
    unitAmount: 7900,
    currency: 'usd',
    image: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1200&q=80',
  }),
  'magnetic-cable-kit': Object.freeze({
    name: 'Magnetic Cable Kit',
    description: 'Reusable magnetic clips and cable ties for a cleaner desk, nightstand, or travel bag.',
    unitAmount: 2900,
    currency: 'usd',
    image: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=1200&q=80',
  }),
  'travel-tech-pouch': Object.freeze({
    name: 'Travel Tech Pouch',
    description: 'A compact organizer for chargers, adapters, earbuds, and everyday carry tech.',
    unitAmount: 4900,
    currency: 'usd',
    image: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=1200&q=80',
  }),
});

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

function addCurrencyTotal(totals, currency, amount) {
  const normalizedCurrency = String(currency || '').trim().toUpperCase() || 'USD';
  const numericAmount = Number(amount);

  if (!normalizedCurrency || !Number.isFinite(numericAmount) || numericAmount === 0) {
    return;
  }

  totals[normalizedCurrency] = (totals[normalizedCurrency] || 0) + numericAmount;
}

function compactCurrencyTotals(totals = {}) {
  return Object.fromEntries(
    Object.entries(totals).filter(([, amount]) => Number.isFinite(amount) && amount !== 0)
  );
}

function humanizeStripeLabel(value) {
  const normalized = String(value || '').trim().replace(/[_-]+/g, ' ');
  if (!normalized) {
    return 'Stripe activity';
  }

  return normalized
    .split(/\s+/)
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function pickFirstNonEmpty(...values) {
  for (const value of values) {
    const normalized = String(value || '').trim();
    if (normalized) {
      return normalized;
    }
  }
  return '';
}

function toIsoTimestamp(seconds) {
  const milliseconds = toMilliseconds(seconds);
  if (!milliseconds) {
    return null;
  }
  return new Date(milliseconds).toISOString();
}

function resolveStripeReferenceId(value) {
  if (!value) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'object' && typeof value.id === 'string') {
    return value.id;
  }

  return '';
}

function describeBalanceTransactionSource(transaction) {
  const source = transaction?.source;
  const sourceId = resolveStripeReferenceId(source || transaction?.source);
  const fallbackLabel = pickFirstNonEmpty(
    transaction?.description,
    humanizeStripeLabel(transaction?.reporting_category || transaction?.type)
  );

  if (!source || typeof source !== 'object') {
    return {
      label: fallbackLabel || 'Stripe activity',
      detail: sourceId ? `Source ${sourceId}` : '',
      sourceId,
      sourceObject: '',
      counterpartyType: '',
      customerId: '',
      customerName: '',
      customerEmail: '',
    };
  }

  const sourceObject = String(source.object || '').trim();

  if (sourceObject === 'charge') {
    const customerId = resolveStripeReferenceId(source.customer);
    const customerName = pickFirstNonEmpty(source.customer?.name, source.billing_details?.name);
    const customerEmail = pickFirstNonEmpty(
      source.customer?.email,
      source.billing_details?.email,
      source.receipt_email
    );
    const invoiceId = resolveStripeReferenceId(source.invoice);
    const paymentMethodType = pickFirstNonEmpty(source.payment_method_details?.type);
    const label = pickFirstNonEmpty(
      customerName,
      customerEmail,
      source.description,
      transaction?.description,
      'Customer payment'
    );
    const detailParts = [];

    if (customerName && customerEmail && label !== customerEmail) {
      detailParts.push(customerEmail);
    }
    if (invoiceId) {
      detailParts.push(`Invoice ${invoiceId}`);
    }
    if (paymentMethodType) {
      detailParts.push(humanizeStripeLabel(paymentMethodType));
    }
    if (sourceId) {
      detailParts.push(`Charge ${sourceId}`);
    }

    return {
      label,
      detail: detailParts.join(' • '),
      sourceId,
      sourceObject,
      counterpartyType: 'customer',
      customerId,
      customerName,
      customerEmail,
    };
  }

  if (sourceObject === 'payout') {
    const arrivalDate = toIsoTimestamp(source.arrival_date);
    const destination = resolveStripeReferenceId(source.destination);
    const label = pickFirstNonEmpty(
      source.description,
      source.statement_descriptor,
      'Bank payout'
    );
    const detailParts = [];

    if (destination) {
      detailParts.push(`Destination ${destination}`);
    }
    if (source.method) {
      detailParts.push(humanizeStripeLabel(source.method));
    }
    if (arrivalDate) {
      detailParts.push(`Arrival ${arrivalDate}`);
    }
    if (sourceId) {
      detailParts.push(`Payout ${sourceId}`);
    }

    return {
      label,
      detail: detailParts.join(' • '),
      sourceId,
      sourceObject,
      counterpartyType: 'bank',
      customerId: '',
      customerName: '',
      customerEmail: '',
    };
  }

  if (sourceObject === 'topup') {
    const label = pickFirstNonEmpty(source.description, transaction?.description, 'Pay in to Stripe');
    const detailParts = [];

    if (source.statement_descriptor) {
      detailParts.push(source.statement_descriptor);
    }
    if (sourceId) {
      detailParts.push(`Top up ${sourceId}`);
    }

    return {
      label,
      detail: detailParts.join(' • '),
      sourceId,
      sourceObject,
      counterpartyType: 'bank',
      customerId: '',
      customerName: '',
      customerEmail: '',
    };
  }

  if (sourceObject === 'refund') {
    const chargeId = resolveStripeReferenceId(source.charge);
    const label = pickFirstNonEmpty(transaction?.description, source.description, 'Customer refund');
    const detailParts = [];

    if (source.reason) {
      detailParts.push(humanizeStripeLabel(source.reason));
    }
    if (chargeId) {
      detailParts.push(`Charge ${chargeId}`);
    }
    if (sourceId) {
      detailParts.push(`Refund ${sourceId}`);
    }

    return {
      label,
      detail: detailParts.join(' • '),
      sourceId,
      sourceObject,
      counterpartyType: 'customer',
      customerId: '',
      customerName: '',
      customerEmail: '',
    };
  }

  const label = pickFirstNonEmpty(
    source.description,
    transaction?.description,
    humanizeStripeLabel(sourceObject),
    humanizeStripeLabel(transaction?.reporting_category || transaction?.type)
  );
  const detailParts = [];

  if (sourceId) {
    detailParts.push(`${humanizeStripeLabel(sourceObject)} ${sourceId}`);
  }

  return {
    label,
    detail: detailParts.join(' • '),
    sourceId,
    sourceObject,
    counterpartyType: '',
    customerId: '',
    customerName: '',
    customerEmail: '',
  };
}

function classifyBalanceTransaction(transaction, sourceSummary) {
  const type = String(transaction?.type || '').trim().toLowerCase();
  const reportingCategory = String(transaction?.reporting_category || '').trim().toLowerCase();
  const descriptor = [
    transaction?.description,
    sourceSummary?.label,
    sourceSummary?.detail,
    sourceSummary?.sourceObject,
    type,
    reportingCategory,
  ].join(' ').toLowerCase();

  if (
    ['advance', 'advance_funding', 'anticipation_repayment'].includes(type)
    || /\b(capital|financing|loan|repay|paydown|advance)\b/.test(descriptor)
  ) {
    return 'financing';
  }

  if (type.includes('payout') || reportingCategory === 'payout' || sourceSummary?.sourceObject === 'payout') {
    return 'payout';
  }

  if (
    type === 'topup'
    || type === 'contribution'
    || reportingCategory === 'topup'
    || /\b(top[\s-]?up|pay[\s-]?in)\b/.test(descriptor)
  ) {
    return 'payin';
  }

  if (type.includes('refund') || reportingCategory.includes('refund') || sourceSummary?.sourceObject === 'refund') {
    return 'refund';
  }

  if (type.includes('fee') || reportingCategory.includes('fee')) {
    return 'fee';
  }

  if (
    type === 'charge'
    || type === 'payment'
    || reportingCategory.includes('charge')
    || reportingCategory.includes('payment')
    || sourceSummary?.counterpartyType === 'customer'
  ) {
    return 'customer_payment';
  }

  return Number(transaction?.net) >= 0 ? 'inflow' : 'outflow';
}

function groupLabelFromType(group) {
  const labels = {
    customer_payment: 'Customer payment',
    payout: 'Payout',
    payin: 'Pay in',
    financing: 'Financing',
    refund: 'Refund',
    fee: 'Stripe fee',
    inflow: 'Inflow',
    outflow: 'Outflow',
  };

  return labels[group] || humanizeStripeLabel(group);
}

function normalizeBalanceTransaction(transaction) {
  const currency = String(transaction?.currency || 'usd').trim().toUpperCase() || 'USD';
  const amount = typeof transaction?.amount === 'number' ? transaction.amount : 0;
  const fee = typeof transaction?.fee === 'number' ? transaction.fee : 0;
  const net = typeof transaction?.net === 'number' ? transaction.net : amount - fee;
  const sourceSummary = describeBalanceTransactionSource(transaction);
  const group = classifyBalanceTransaction(transaction, sourceSummary);
  const typeLabel = humanizeStripeLabel(transaction?.type);
  const reportingLabel = humanizeStripeLabel(transaction?.reporting_category || transaction?.type);
  let label = sourceSummary.label || reportingLabel;

  if (group === 'financing' && /stripe activity/i.test(label)) {
    label = net >= 0 ? 'Stripe financing payout' : 'Stripe financing paydown';
  }

  if (group === 'fee' && (!label || /stripe activity/i.test(label))) {
    label = 'Stripe fees';
  }

  return {
    id: String(transaction?.id || '').trim(),
    createdAt: toIsoTimestamp(transaction?.created),
    availableOn: toIsoTimestamp(transaction?.available_on),
    currency,
    amount,
    fee,
    net,
    type: String(transaction?.type || '').trim(),
    typeLabel,
    reportingCategory: String(transaction?.reporting_category || '').trim(),
    reportingLabel,
    status: String(transaction?.status || '').trim(),
    sourceId: sourceSummary.sourceId,
    sourceObject: sourceSummary.sourceObject,
    label,
    detail: sourceSummary.detail,
    description: String(transaction?.description || '').trim(),
    counterpartyType: sourceSummary.counterpartyType,
    customerId: sourceSummary.customerId,
    customerName: sourceSummary.customerName,
    customerEmail: sourceSummary.customerEmail,
    group,
    groupLabel: groupLabelFromType(group),
    direction: net > 0 ? 'inflow' : net < 0 ? 'outflow' : 'flat',
  };
}

function summarizeCashflowTransactions(transactions = []) {
  const normalizedTransactions = Array.isArray(transactions)
    ? transactions.map(normalizeBalanceTransaction)
    : [];
  const summary = {
    inflow: {},
    outflow: {},
    fees: {},
    net: {},
    payouts: {},
    payins: {},
    financingIn: {},
    financingOut: {},
    customerPayments: {},
    refunds: {},
  };

  normalizedTransactions.forEach(transaction => {
    const currency = transaction.currency || 'USD';

    addCurrencyTotal(summary.net, currency, transaction.net);

    if (transaction.amount > 0) {
      addCurrencyTotal(summary.inflow, currency, transaction.amount);
    }
    if (transaction.amount < 0) {
      addCurrencyTotal(summary.outflow, currency, Math.abs(transaction.amount));
    }
    if (transaction.fee > 0) {
      addCurrencyTotal(summary.fees, currency, transaction.fee);
    }
    if (transaction.group === 'fee' && transaction.fee === 0 && transaction.net < 0) {
      addCurrencyTotal(summary.fees, currency, Math.abs(transaction.net));
    }
    if (transaction.group === 'payout') {
      addCurrencyTotal(summary.payouts, currency, Math.abs(transaction.net || transaction.amount));
    }
    if (transaction.group === 'payin') {
      addCurrencyTotal(summary.payins, currency, Math.abs(transaction.net || transaction.amount));
    }
    if (transaction.group === 'financing') {
      if (transaction.net >= 0) {
        addCurrencyTotal(summary.financingIn, currency, transaction.net || transaction.amount);
      } else {
        addCurrencyTotal(summary.financingOut, currency, Math.abs(transaction.net || transaction.amount));
      }
    }
    if (transaction.group === 'customer_payment' && transaction.amount > 0) {
      addCurrencyTotal(summary.customerPayments, currency, transaction.amount);
    }
    if (transaction.group === 'refund') {
      addCurrencyTotal(summary.refunds, currency, Math.abs(transaction.net || transaction.amount));
    }
  });

  return {
    transactionCount: normalizedTransactions.length,
    inflow: compactCurrencyTotals(summary.inflow),
    outflow: compactCurrencyTotals(summary.outflow),
    fees: compactCurrencyTotals(summary.fees),
    net: compactCurrencyTotals(summary.net),
    payouts: compactCurrencyTotals(summary.payouts),
    payins: compactCurrencyTotals(summary.payins),
    financingIn: compactCurrencyTotals(summary.financingIn),
    financingOut: compactCurrencyTotals(summary.financingOut),
    customerPayments: compactCurrencyTotals(summary.customerPayments),
    refunds: compactCurrencyTotals(summary.refunds),
  };
}

function toCurrencyAmount(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  const parsed = Number.parseFloat(String(value || '').trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function toMonthlyAmount(entry) {
  if (!entry || typeof entry !== 'object') {
    return 0;
  }

  const interval = String(entry?.price?.recurring?.interval || '').trim().toLowerCase();
  const intervalCount = Math.max(1, Number.parseInt(entry?.price?.recurring?.interval_count, 10) || 1);
  const quantity = Math.max(1, Number.parseInt(entry?.quantity, 10) || 1);
  const unitAmount = toCurrencyAmount(entry?.price?.unit_amount ?? entry?.price?.unit_amount_decimal);
  const grossAmount = unitAmount * quantity;

  if (!grossAmount || !interval) {
    return 0;
  }

  if (interval === 'month') {
    return Math.round(grossAmount / intervalCount);
  }

  if (interval === 'year') {
    return Math.round(grossAmount / (12 * intervalCount));
  }

  if (interval === 'week') {
    return Math.round((grossAmount * 52) / (12 * intervalCount));
  }

  if (interval === 'day') {
    return Math.round((grossAmount * 30) / intervalCount);
  }

  return 0;
}

function summarizeRecurringRevenue(subscriptions = []) {
  return subscriptions.reduce((acc, subscription) => {
    const items = Array.isArray(subscription?.items?.data)
      ? subscription.items.data
      : [];

    items.forEach(item => {
      const currency = String(item?.price?.currency || 'usd').trim().toUpperCase();
      const monthlyAmount = toMonthlyAmount(item);
      if (!monthlyAmount) {
        return;
      }
      acc[currency] = (acc[currency] || 0) + monthlyAmount;
    });

    return acc;
  }, {});
}

function summarizeSubscriptionPlans(subscriptions = [], pricePlanMap = {}) {
  return subscriptions.reduce((acc, subscription) => {
    const plan = String(resolvePlanFromSubscription(subscription, pricePlanMap) || 'unknown').trim().toLowerCase() || 'unknown';
    acc[plan] = (acc[plan] || 0) + 1;
    return acc;
  }, {});
}

function resolvePricePlanMap(config = process.env) {
  const configured = {
    [String(config?.STRIPE_PRICE_STARTER_ID || config?.STRIPE_PRICE_SUPPORTER_ID || '').trim()]: 'starter',
    [String(config?.STRIPE_PRICE_PRO_ID || config?.STRIPE_PRICE_FOUNDER_ID || '').trim()]: 'pro',
    [String(config?.STRIPE_PRICE_BUILDER_ID || config?.STRIPE_PRICE_STUDIO_ID || '').trim()]: 'builder',
    [String(config?.STRIPE_PRICE_EMBEDDED_ID || config?.STRIPE_PRICE_EXECUTION_ID || config?.STRIPE_PRICE_200_ID || '').trim()]: 'embedded'
  };

  return Object.fromEntries(
    Object.entries(configured).filter(([key]) => Boolean(String(key || '').trim()))
  );
}

function getRouteValue(req) {
  const route = req?.query?.route;
  if (Array.isArray(route)) {
    return String(route[0] || '').trim().toLowerCase();
  }

  return String(route || '').trim().toLowerCase();
}

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

function readBody(req) {
  return req?.body && typeof req.body === 'object' ? req.body : {};
}

function normalizeStorefrontQuantity(value) {
  const quantity = Number.parseInt(value, 10);
  if (!Number.isFinite(quantity)) return 1;
  return Math.min(Math.max(quantity, 1), 5);
}

async function createStorefrontCheckoutSession(req, stripeClient, res, config = process.env) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    return res.status(200).json({
      stripeConfigured: Boolean(config.STRIPE_SECRET_KEY),
      products: Object.keys(SAMPLE_STOREFRONT_PRODUCTS),
    });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST, OPTIONS');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const body = readBody(req);
  const productId = String(body.productId || '').trim();
  const product = SAMPLE_STOREFRONT_PRODUCTS[productId];
  const quantity = normalizeStorefrontQuantity(body.quantity);
  const orderId = String(body.orderId || '').trim().slice(0, 80);
  const customerEmail = String(body.customerEmail || '').trim().toLowerCase();
  const customerName = String(body.customerName || '').trim().slice(0, 120);
  const origin = getRequestOrigin(req, config);

  if (!product) {
    return res.status(400).json({ error: 'Unknown product.' });
  }

  if (!orderId) {
    return res.status(400).json({ error: 'Missing order id.' });
  }

  const session = await stripeClient.checkout.sessions.create({
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

async function listMetrics(stripeClient, res, config = process.env) {
  const subscriptionsIterator = stripeClient.subscriptions.list({
    status: 'active',
    limit: 100,
    expand: ['data.items.data.price']
  });
  const allSubscriptions = await subscriptionsIterator.autoPagingToArray({ limit: 1000 });
  const balance = await stripeClient.balance.retrieve();
  const pricePlanMap = resolvePricePlanMap(config);

  return res.status(200).json({
    available: summarizeBalances(balance.available),
    pending: summarizeBalances(balance.pending),
    activeSubscribers: allSubscriptions.length,
    recurringRevenue: summarizeRecurringRevenue(allSubscriptions),
    planCounts: summarizeSubscriptionPlans(allSubscriptions, pricePlanMap),
    hasMoreSubscribers: allSubscriptions.length >= 1000
  });
}

async function listCashflow(req, stripeClient, res) {
  const requestedLimit = Number.parseInt(req?.query?.limit, 10);
  const detailLimit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(requestedLimit, 5), 50)
    : 25;
  const summaryLimit = 5000;

  const [recentRawTransactions, summaryRawTransactions] = await Promise.all([
    stripeClient.balanceTransactions.list({
      limit: detailLimit,
      expand: ['data.source']
    }).autoPagingToArray({ limit: detailLimit }),
    stripeClient.balanceTransactions.list({
      limit: 100
    }).autoPagingToArray({ limit: summaryLimit }),
  ]);

  const updatedAt = new Date().toISOString();

  return res.status(200).json({
    updatedAt,
    detailLimit,
    transactions: recentRawTransactions.map(normalizeBalanceTransaction),
    summary: {
      ...summarizeCashflowTransactions(summaryRawTransactions),
      updatedAt,
      detailLimit,
      summaryLimit,
      isTruncated: summaryRawTransactions.length >= summaryLimit,
    }
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
  stripeClient,
  config = process.env
} = {}) {
  const resolvedStripeClient = stripeClient || makeStripeClient(config);
  const checkoutHandler = createStripeCheckoutHandler({
    stripeClient: resolvedStripeClient,
    config,
  });
  const statusHandler = createStripeStatusHandler({
    stripeClient: resolvedStripeClient,
    config,
  });

  return async function handler(req, res) {
    const route = getRouteValue(req);
    if (route === 'checkout') {
      return checkoutHandler(req, res);
    }
    if (route === 'status') {
      return statusHandler(req, res);
    }
    if (route === 'storefront-checkout') {
      try {
        return await createStorefrontCheckoutSession(req, resolvedStripeClient, res, config);
      } catch (error) {
        console.error('Failed to create Stripe storefront checkout', error);
        return res.status(500).json({ error: 'Unable to create Stripe storefront checkout.' });
      }
    }

    if (!resolvedStripeClient) {
      return res.status(500).json({ error: 'Stripe is not configured on the server.' });
    }

    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
      if (route === 'customers') {
        return await listCustomers(resolvedStripeClient, res);
      }
      if (route === 'metrics') {
        return await listMetrics(resolvedStripeClient, res, config);
      }
      if (route === 'cashflow') {
        return await listCashflow(req, resolvedStripeClient, res);
      }
      if (route === 'events') {
        return await listEvents(req, resolvedStripeClient, res, config);
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

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(['active', 'trialing', 'past_due']);

function normalizeText(value) {
  return String(value || '').trim();
}

export function normalizeOfferKey(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function parseAutopilotReferenceId(value = '') {
  const normalized = normalizeText(value);
  const [runId = '', offerProfile = ''] = normalized.split('__', 2);
  return {
    runId: normalizeText(runId),
    offerProfile: normalizeOfferKey(offerProfile)
  };
}

function paymentLinkId(session = {}) {
  return typeof session.payment_link === 'string'
    ? session.payment_link
    : normalizeText(session.payment_link?.id);
}

function offerKeyFromPaymentLink(link = {}) {
  const metadata = link.metadata && typeof link.metadata === 'object' ? link.metadata : {};
  return normalizeOfferKey(
    metadata.offer
    || metadata['3dvr_offer']
    || metadata.offer_id
    || metadata.plan
    || ''
  );
}
function monthlyCentsForItem(item = {}) {
  const price = item.price || {};
  const recurring = price.recurring || {};
  const amount = Number(price.unit_amount ?? price.unit_amount_decimal ?? 0);
  const quantity = Math.max(1, Number(item.quantity || 1));
  const intervalCount = Math.max(1, Number(recurring.interval_count || 1));
  if (!Number.isFinite(amount) || amount <= 0 || !recurring.interval) return 0;

  const gross = amount * quantity;
  if (recurring.interval === 'month') return Math.round(gross / intervalCount);
  if (recurring.interval === 'year') return Math.round(gross / (12 * intervalCount));
  if (recurring.interval === 'week') return Math.round((gross * 52) / (12 * intervalCount));
  if (recurring.interval === 'day') return Math.round((gross * 30) / intervalCount);
  return 0;
}

function addOfferRevenue(groups, offer, session, link) {
  if (!offer) return;
  const current = groups.get(offer) || {
    offer,
    paidCheckouts: 0,
    grossRevenueCents: 0,
    checkoutUrl: normalizeText(link?.url),
    lastPaidAt: null
  };
  current.paidCheckouts += 1;
  current.grossRevenueCents += Number(session.amount_total || 0);
  const created = Number(session.created || 0);
  if (created && (!current.lastPaidAt || created > current.lastPaidAt)) current.lastPaidAt = created;
  if (!current.checkoutUrl && link?.url) current.checkoutUrl = normalizeText(link.url);
  groups.set(offer, current);
}
export function summarizeStripeRevenue({ sessions = [], paymentLinks = [], subscriptions = [] } = {}) {
  const links = new Map(paymentLinks.map(link => [normalizeText(link?.id), link]));
  const groups = new Map();
  let paidCheckouts = 0;
  let grossRevenueCents = 0;
  let attributedPaidCheckouts = 0;

  for (const session of sessions) {
    if (normalizeText(session?.payment_status).toLowerCase() !== 'paid') continue;
    paidCheckouts += 1;
    grossRevenueCents += Number(session?.amount_total || 0);

    const reference = parseAutopilotReferenceId(session?.client_reference_id);
    const link = links.get(paymentLinkId(session));
    const offer = reference.offerProfile || offerKeyFromPaymentLink(link);
    if (reference.runId || offer) attributedPaidCheckouts += 1;
    addOfferRevenue(groups, offer, session, link);
  }

  let monthlyRecurringRevenueCents = 0;
  let activeSubscribers = 0;
  for (const subscription of subscriptions) {
    if (!ACTIVE_SUBSCRIPTION_STATUSES.has(normalizeText(subscription?.status).toLowerCase())) continue;
    activeSubscribers += 1;
    for (const item of subscription?.items?.data || []) {
      monthlyRecurringRevenueCents += monthlyCentsForItem(item);
    }
  }

  return {
    enabled: true,
    paidCheckouts,
    attributedPaidCheckouts,
    unattributedPaidCheckouts: Math.max(0, paidCheckouts - attributedPaidCheckouts),
    grossRevenueCents,
    activeSubscribers,
    monthlyRecurringRevenueCents,
    byOffer: [...groups.values()].sort((a, b) => (
      b.grossRevenueCents - a.grossRevenueCents || b.paidCheckouts - a.paidCheckouts
    ))
  };
}
export async function collectStripeRevenueHints({ stripeClient, limit = 100 } = {}) {
  if (!stripeClient?.checkout?.sessions?.list) {
    return {
      enabled: false,
      reason: 'Stripe Checkout session access is unavailable.',
      paidCheckouts: 0,
      attributedPaidCheckouts: 0,
      unattributedPaidCheckouts: 0,
      grossRevenueCents: 0,
      activeSubscribers: 0,
      monthlyRecurringRevenueCents: 0,
      byOffer: []
    };
  }

  const boundedLimit = Math.max(10, Math.min(Number(limit) || 100, 100));
  const [sessionsResult, linksResult, subscriptionsResult] = await Promise.all([
    stripeClient.checkout.sessions.list({ limit: boundedLimit }),
    stripeClient.paymentLinks?.list
      ? stripeClient.paymentLinks.list({ limit: boundedLimit })
      : Promise.resolve({ data: [] }),
    stripeClient.subscriptions?.list
      ? stripeClient.subscriptions.list({ status: 'all', limit: boundedLimit })
      : Promise.resolve({ data: [] })
  ]);

  return {
    ...summarizeStripeRevenue({
      sessions: sessionsResult?.data || [],
      paymentLinks: linksResult?.data || [],
      subscriptions: subscriptionsResult?.data || []
    }),
    generatedAt: new Date().toISOString(),
    sampleLimit: boundedLimit
  };
}
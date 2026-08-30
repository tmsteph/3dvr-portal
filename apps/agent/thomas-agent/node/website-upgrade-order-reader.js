const DEFAULT_PAYMENT_LINK_ID = process.env.THREEDVR_WEBSITE_UPGRADE_PAYMENT_LINK_ID || 'plink_1U9JF6GiUl5dM378HHz6Ss5z';
const STRIPE_API_BASE = 'https://api.stripe.com/v1';

function normalizeText(value) {
  return String(value || '').trim();
}

function customFieldValue(field = {}) {
  const type = normalizeText(field.type);
  if (type && field[type] && typeof field[type] === 'object') {
    return normalizeText(field[type].value);
  }
  for (const key of ['text', 'dropdown', 'numeric']) {
    if (field[key] && typeof field[key] === 'object' && field[key].value != null) {
      return normalizeText(field[key].value);
    }
  }
  return '';
}

function customFieldsObject(session = {}) {
  const output = {};
  for (const field of Array.isArray(session.custom_fields) ? session.custom_fields : []) {
    const key = normalizeText(field.key);
    if (!key) continue;
    output[key] = customFieldValue(field);
  }
  return output;
}

function normalizeHostedSiteUrl(value) {
  const input = normalizeText(value);
  if (!input) throw new Error('Website Upgrade checkout is missing site_url.');

  let parsed;
  try {
    parsed = new URL(input);
  } catch {
    throw new Error('Website Upgrade site_url is not a valid URL.');
  }

  const host = parsed.hostname.toLowerCase();
  if (!['3dvr.tech', 'www.3dvr.tech'].includes(host)) {
    throw new Error('Website Upgrade auto-fulfillment only supports 3DVR-hosted free drafts.');
  }

  const match = parsed.pathname.match(/^\/free-sites\/([a-z0-9][a-z0-9-]{0,79})\/?$/i);
  if (!match) {
    throw new Error('Website Upgrade site_url must point to a 3DVR free-site draft.');
  }

  const slug = match[1].toLowerCase();
  return {
    slug,
    siteUrl: `https://3dvr.tech/free-sites/${slug}/`,
  };
}

function sessionToUpgradeOrder(session = {}) {
  if (normalizeText(session.payment_status).toLowerCase() !== 'paid') return null;
  if (normalizeText(session.status).toLowerCase() !== 'complete') return null;

  const sessionId = normalizeText(session.id);
  if (!sessionId) throw new Error('Website Upgrade checkout is missing a session id.');

  const fields = customFieldsObject(session);
  const businessName = normalizeText(fields.business_name);
  const mainAction = normalizeText(fields.main_action);
  if (!businessName) throw new Error(`Website Upgrade ${sessionId} is missing business_name.`);
  if (!mainAction) throw new Error(`Website Upgrade ${sessionId} is missing main_action.`);

  const hosted = normalizeHostedSiteUrl(fields.site_url);
  return {
    sessionId,
    businessName,
    mainAction,
    siteUrl: hosted.siteUrl,
    slug: hosted.slug,
    customerEmail: normalizeText(session.customer_details?.email || session.customer_email),
    amountTotal: Number.isFinite(Number(session.amount_total)) ? Number(session.amount_total) : null,
    currency: normalizeText(session.currency).toLowerCase(),
    created: Number.isFinite(Number(session.created)) ? Number(session.created) : null,
  };
}

async function listCompletedUpgradeOrders(options = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || fetch;
  const secretKey = normalizeText(env.STRIPE_SECRET_KEY);
  if (!secretKey) throw new Error('STRIPE_SECRET_KEY is required.');

  const paymentLinkId = normalizeText(
    options.paymentLinkId
    || env.THREEDVR_WEBSITE_UPGRADE_PAYMENT_LINK_ID
    || DEFAULT_PAYMENT_LINK_ID,
  );
  if (!paymentLinkId) throw new Error('Website Upgrade payment link id is required.');

  const params = new URLSearchParams({
    payment_link: paymentLinkId,
    status: 'complete',
    limit: String(Math.max(1, Math.min(Number(options.limit || 20), 100))),
  });
  const response = await fetchImpl(`${STRIPE_API_BASE}/checkout/sessions?${params}`, {
    headers: { Authorization: `Bearer ${secretKey}` },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || `Stripe returned ${response.status}`;
    throw new Error(message);
  }

  const orders = [];
  const blocked = [];
  for (const session of Array.isArray(payload.data) ? payload.data : []) {
    try {
      const order = sessionToUpgradeOrder(session);
      if (order) orders.push(order);
    } catch (error) {
      blocked.push({
        sessionId: normalizeText(session?.id),
        reason: String(error?.message || error),
      });
    }
  }

  orders.sort((a, b) => Number(a.created || 0) - Number(b.created || 0));
  return { orders, blocked, paymentLinkId };
}

async function cli() {
  const result = await listCompletedUpgradeOrders();
  console.log(JSON.stringify(result, null, 2));
}

module.exports = {
  DEFAULT_PAYMENT_LINK_ID,
  customFieldValue,
  customFieldsObject,
  listCompletedUpgradeOrders,
  normalizeHostedSiteUrl,
  sessionToUpgradeOrder,
};

if (require.main === module) {
  cli().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}

const OFFERS = new Set(['website-upgrade', 'automation-quick-win', 'business-sites', 'freelancer-growth-autopilot']);
const OWNER = /\b(legal|lawyer|tax|irs|refund|chargeback|bank transfer|wire transfer|password|credential|secret|api key|medical|hipaa|regulated)\b/i;
const LOCAL = /\b(on[- ]?site|in person|physical install|mount|wiring|cabling|repair|delivery|moving|event setup|stagehand|hardware install|field service)\b/i;
const CONTRACTOR = /\b(logo|graphic design|illustration|photography|video edit|3d model|3d modeling|cad|copywriting|translation|voiceover)\b/i;

const clean = value => String(value || '').trim();
const lower = value => clean(value).toLowerCase();
const normalizeOffer = value => lower(value).replace(/[_\s]+/g, '-');

function money(cents, code = 'usd') {
  const amount = Number(cents || 0);
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency', currency: clean(code).toUpperCase() || 'USD'
    }).format((Number.isFinite(amount) ? amount : 0) / 100);
  } catch {
    return `${((Number.isFinite(amount) ? amount : 0) / 100).toFixed(2)} USD`;
  }
}

export function readCheckoutFieldMap(session = {}) {
  return Object.fromEntries((Array.isArray(session.custom_fields) ? session.custom_fields : [])
    .map(field => [clean(field?.key || field?.label?.custom), clean(field?.text?.value ?? field?.numeric?.value ?? field?.dropdown?.value)])
    .filter(([key, value]) => key && value));
}
export function isAutoBusinessCheckout(session = {}) {
  const metadata = session?.metadata && typeof session.metadata === 'object' ? session.metadata : {};
  const offer = normalizeOffer(metadata.offer || metadata.offer_id || metadata.product_key || metadata.custom_label);
  const source = lower(metadata.source);
  return OFFERS.has(offer) || source === 'autobusiness' || source === 'free-site-campaign';
}

export function chooseFulfillmentLane({ offer = '', fields = {}, metadata = {} } = {}) {
  const text = [offer, ...Object.values(fields), metadata.custom_description, metadata.description].map(clean).join(' ');
  if (OWNER.test(text)) return { lane: 'owner-review', reason: 'High-impact money, credential, legal, or regulated boundary.' };
  if (LOCAL.test(text)) return { lane: 'local-worker', reason: 'Physical or on-site fulfillment appears necessary.' };
  if (CONTRACTOR.test(text)) return { lane: 'contractor', reason: 'Specialist production work is better scoped to a contractor.' };
  return { lane: 'agent', reason: 'Digital work defaults to agent-first fulfillment.' };
}

function checklist(lane) {
  if (lane === 'local-worker') return ['Retrieve private Stripe intake.', 'Scope the local task and acceptance criteria.', 'Use approved marketplace/partner channels only.', 'Require approval before spend or booking.', 'Record delivery and margin.'];
  if (lane === 'contractor') return ['Retrieve private Stripe intake.', 'Complete automatable prep first.', 'Scope only the remaining specialist work.', 'Require approval before contractor spend.', 'QA delivery and record margin.'];
  if (lane === 'owner-review') return ['Retrieve private Stripe intake.', 'Prepare the high-impact decision without executing it.', 'Wait for owner approval.', 'Continue agent fulfillment after approval.', 'Record delivery and margin.'];
  return ['Retrieve private Stripe intake.', 'Build the smallest working deliverable.', 'Use 3DVR agents/code before outsourcing.', 'Escalate only blocked specialist/physical/high-impact steps.', 'Deliver and record margin.'];
}

export function buildFulfillmentOrder(event = {}) {
  const session = event?.data?.object || {};
  if (!['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(clean(event.type))) return null;
  if (!isAutoBusinessCheckout(session)) return null;
  const paymentStatus = lower(session.payment_status);
  if (event.type === 'checkout.session.completed' && paymentStatus && !['paid', 'no_payment_required'].includes(paymentStatus)) return null;

  const metadata = session?.metadata && typeof session.metadata === 'object' ? session.metadata : {};
  const fields = readCheckoutFieldMap(session);
  const offer = normalizeOffer(metadata.offer || metadata.offer_id || metadata.product_key || metadata.custom_label) || 'autobusiness-order';
  const route = chooseFulfillmentLane({ offer, fields, metadata });
  const eventId = clean(event.id);
  const sessionId = clean(session.id);
  const marker = `3dvr-fulfillment:${eventId || sessionId}`;
  const amount = money(session.amount_total, session.currency);
  const laneSteps = checklist(route.lane);
  const publicBody = [
    `<!-- ${marker} -->`, '## Paid fulfillment order', '',
    `- **Offer:** ${offer}`, `- **Amount:** ${amount}`,
    `- **Routing lane:** ${route.lane}`, `- **Why:** ${route.reason}`,
    `- **Stripe event:** ${eventId || 'unknown'}`, `- **Checkout session:** ${sessionId || 'unknown'}`,
    '', '> Customer identity and checkout intake stay private in Stripe/email.', '',
    '## Fulfillment checklist', ...laneSteps.map(item => `- [ ] ${item}`), '',
    '## Close the loop', '- [ ] Customer received the result', '- [ ] Revenue, direct spend, and gross margin recorded',
    '- [ ] Reusable automation/template extracted', '- [ ] Decide: kill, keep, or scale'
  ].join('\n');
  const customerEmail = lower(session.customer_details?.email || session.customer_email || metadata.billing_email);
  const intake = Object.entries(fields).map(([key, value]) => `${key}: ${value}`).join('\n');
  const privateSummary = [`Paid Auto Business order: ${offer}`, `Route: ${route.lane} — ${route.reason}`,
    `Amount: ${amount}`, `Stripe event: ${eventId || 'unknown'}`, `Checkout session: ${sessionId || 'unknown'}`,
    customerEmail ? `Email: ${customerEmail}` : '', intake ? `\nIntake:\n${intake}` : '', `\nNext: ${laneSteps[0]}`].filter(Boolean).join('\n');
  return {
    marker, offer, lane: route.lane, routeReason: route.reason, amount,
    eventId, sessionId, customerEmail, fields, privateSummary,
    safeTitle: `[Fulfillment:${route.lane}] ${offer.replace(/[-_]+/g, ' ')} — ${amount}`,
    publicBody
  };
}

function githubSettings(config = process.env) {
  const token = clean(config.AUTO_BUSINESS_FULFILLMENT_GITHUB_TOKEN || config.MONEY_AUTOPILOT_GH_TOKEN || config.GITHUB_TOKEN || config.GH_PAT);
  const repository = clean(config.AUTO_BUSINESS_FULFILLMENT_REPO || config.GITHUB_REPOSITORY
    || (config.GITHUB_OWNER && config.GITHUB_REPO ? `${config.GITHUB_OWNER}/${config.GITHUB_REPO}` : '')) || 'tmsteph/3dvr-portal';
  return { token, repository };
}

async function githubJson(fetchImpl, url, token, options = {}) {
  const response = await fetchImpl(url, { ...options, headers: {
    Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28',
    Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(options.headers || {})
  }});
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`GitHub fulfillment request failed (${response.status}): ${payload?.message || 'unknown error'}`);
  return payload;
}

export async function createOrFindFulfillmentIssue(order, { config = process.env, fetchImpl = globalThis.fetch } = {}) {
  if (!order) return { status: 'skipped' };
  const { token, repository } = githubSettings(config);
  if (!token || typeof fetchImpl !== 'function') return { status: 'private-queue-only', repository, reason: 'GitHub write token is not configured' };
  const query = encodeURIComponent(`repo:${repository} is:issue in:body \"${order.marker}\"`);
  const search = await githubJson(fetchImpl, `https://api.github.com/search/issues?q=${query}`, token);
  const existing = Array.isArray(search.items) ? search.items[0] : null;
  if (existing) return { status: 'existing', repository, issueNumber: existing.number, url: existing.html_url || '' };
  const created = await githubJson(fetchImpl, `https://api.github.com/repos/${repository}/issues`, token, {
    method: 'POST', body: JSON.stringify({ title: order.safeTitle, body: order.publicBody })
  });
  return { status: 'created', repository, issueNumber: created.number, url: created.html_url || '' };
}

export async function dispatchPaidCheckout(event, options = {}) {
  const order = buildFulfillmentOrder(event);
  if (!order) return { order: null, ticket: { status: 'skipped' } };
  try {
    return { order, ticket: await createOrFindFulfillmentIssue(order, options) };
  } catch (error) {
    return { order, ticket: { status: 'error', reason: error?.message || String(error) } };
  }
}

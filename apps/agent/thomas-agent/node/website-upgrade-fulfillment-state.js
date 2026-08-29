const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const DEFAULT_STATE_DIR = process.env.THREEDVR_AUTOPILOT_STATE_DIR || path.join(ROOT, 'state');
const DEFAULT_STATE_FILE = process.env.THREEDVR_WEBSITE_UPGRADE_STATE_FILE
  || path.join(DEFAULT_STATE_DIR, 'website-upgrade-fulfillment-state.json');

const TERMINAL_STATUSES = new Set(['delivered', 'blocked']);
const VALID_STATUSES = new Set(['received', 'processing', 'delivered', 'blocked', 'failed']);

function nowIso(now = () => new Date()) {
  return now().toISOString();
}

function ensureStateFile(stateFile = DEFAULT_STATE_FILE) {
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  if (!fs.existsSync(stateFile)) {
    const initial = { version: 1, orders: {} };
    fs.writeFileSync(stateFile, `${JSON.stringify(initial, null, 2)}\n`);
    return initial;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    return {
      version: 1,
      orders: parsed.orders && typeof parsed.orders === 'object' ? parsed.orders : {},
    };
  } catch {
    return { version: 1, orders: {} };
  }
}

function saveState(state, stateFile = DEFAULT_STATE_FILE) {
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  const tmp = `${stateFile}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`);
  fs.renameSync(tmp, stateFile);
}

function requireSessionId(order) {
  const sessionId = String(order?.sessionId || '').trim();
  if (!sessionId) throw new Error('Website Upgrade fulfillment requires a Stripe Checkout Session ID.');
  return sessionId;
}

function receiveOrder(state, order, options = {}) {
  const sessionId = requireSessionId(order);
  const existing = state.orders[sessionId];
  if (existing) return { record: existing, created: false, terminal: TERMINAL_STATUSES.has(existing.status) };

  const at = nowIso(options.now);
  const record = {
    sessionId,
    status: 'received',
    slug: String(order.slug || '').trim(),
    siteUrl: String(order.siteUrl || '').trim(),
    customerEmail: String(order.customerEmail || '').trim(),
    businessName: String(order.businessName || '').trim(),
    mainAction: String(order.mainAction || '').trim(),
    receivedAt: at,
    updatedAt: at,
    attempts: 0,
    deliverySentAt: null,
  };
  state.orders[sessionId] = record;
  return { record, created: true, terminal: false };
}

function transitionOrder(state, sessionId, status, details = {}, options = {}) {
  if (!VALID_STATUSES.has(status)) throw new Error(`Invalid Website Upgrade fulfillment status: ${status}`);
  const record = state.orders[sessionId];
  if (!record) throw new Error(`Unknown Website Upgrade fulfillment session: ${sessionId}`);
  if (TERMINAL_STATUSES.has(record.status) && record.status !== status) return record;

  const at = nowIso(options.now);
  const next = { ...record, ...details, status, updatedAt: at };
  if (status === 'processing') next.attempts = Number(record.attempts || 0) + 1;
  if (status === 'delivered' && !next.deliverySentAt) next.deliverySentAt = at;
  state.orders[sessionId] = next;
  return next;
}

function shouldDeliver(record) {
  return Boolean(record && record.status !== 'delivered' && !record.deliverySentAt);
}

module.exports = {
  DEFAULT_STATE_FILE,
  TERMINAL_STATUSES,
  ensureStateFile,
  receiveOrder,
  saveState,
  shouldDeliver,
  transitionOrder,
};

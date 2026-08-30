const { websiteUpgradeFulfillmentNode } = require('./gun-db');

const TERMINAL_STATUSES = new Set(['delivered', 'blocked']);
const VALID_STATUSES = new Set(['received', 'processing', 'delivered', 'blocked', 'failed']);

function nowIso(now = () => new Date()) {
  return now().toISOString();
}

function requireSessionId(order) {
  const sessionId = String(order?.sessionId || '').trim();
  if (!sessionId) throw new Error('Website Upgrade fulfillment requires a Stripe Checkout Session ID.');
  return sessionId;
}

function sessionNode(sessionId) {
  return websiteUpgradeFulfillmentNode().get(sessionId);
}

function readNode(node, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out reading Website Upgrade fulfillment state from GunJS.')), timeoutMs);
    node.once((data) => {
      clearTimeout(timer);
      if (data === null || data === undefined) {
        resolve(null);
        return;
      }
      if (typeof data !== 'object' || Array.isArray(data)) {
        reject(new Error('Malformed Website Upgrade fulfillment state in GunJS.'));
        return;
      }
      resolve(data);
    });
  });
}

function writeNode(node, value, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out writing Website Upgrade fulfillment state to GunJS.')), timeoutMs);
    node.put(value, (ack) => {
      clearTimeout(timer);
      if (ack && ack.err) reject(new Error(`GunJS fulfillment write failed: ${ack.err}`));
      else resolve(value);
    });
  });
}

async function receiveOrder(order, options = {}) {
  const sessionId = requireSessionId(order);
  const node = (options.node || sessionNode)(sessionId);
  const existing = await readNode(node, options.timeoutMs);
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
    deliveryState: 'pending',
    deliveryReservedAt: null,
    deliveryReservationId: null,
    deliverySentAt: null,
  };
  await writeNode(node, record, options.timeoutMs);
  return { record, created: true, terminal: false };
}

async function reserveDelivery(sessionId, reservationId, options = {}) {
  const id = String(reservationId || '').trim();
  if (!id) throw new Error('Website Upgrade delivery reservation requires an ID.');

  const node = (options.node || sessionNode)(sessionId);
  const record = await readNode(node, options.timeoutMs);
  if (!record) throw new Error(`Unknown Website Upgrade fulfillment session: ${sessionId}`);

  if (
    TERMINAL_STATUSES.has(record.status)
    || record.deliverySentAt
    || record.deliveryReservedAt
  ) {
    return { record, reserved: false };
  }

  const at = nowIso(options.now);
  const next = {
    ...record,
    deliveryState: 'reserved',
    deliveryReservedAt: at,
    deliveryReservationId: id,
    updatedAt: at,
  };
  await writeNode(node, next, options.timeoutMs);
  return { record: next, reserved: true };
}

async function transitionOrder(sessionId, status, details = {}, options = {}) {
  if (!VALID_STATUSES.has(status)) throw new Error(`Invalid Website Upgrade fulfillment status: ${status}`);
  const node = (options.node || sessionNode)(sessionId);
  const record = await readNode(node, options.timeoutMs);
  if (!record) throw new Error(`Unknown Website Upgrade fulfillment session: ${sessionId}`);
  if (TERMINAL_STATUSES.has(record.status) && record.status !== status) return record;

  const at = nowIso(options.now);
  const next = { ...record, ...details, status, updatedAt: at };
  if (status === 'processing') next.attempts = Number(record.attempts || 0) + 1;
  if (status === 'delivered') {
    if (!next.deliverySentAt) next.deliverySentAt = at;
    next.deliveryState = 'sent';
  }
  await writeNode(node, next, options.timeoutMs);
  return next;
}

function shouldDeliver(record) {
  return Boolean(
    record
    && !TERMINAL_STATUSES.has(record.status)
    && !record.deliveryReservedAt
    && !record.deliverySentAt
  );
}

module.exports = {
  TERMINAL_STATUSES,
  readNode,
  receiveOrder,
  reserveDelivery,
  shouldDeliver,
  transitionOrder,
  writeNode,
};

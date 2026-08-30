function text(value) {
  return String(value || '').trim();
}

function publicationKey(sessionId) {
  return `website-upgrade:publish:${text(sessionId)}`;
}

function deliveryKey(sessionId) {
  return `website-upgrade:delivery:${text(sessionId)}`;
}

function defaultStateApi() {
  return require('./website-upgrade-fulfillment-state');
}

function validateBoundedOrder(order) {
  const sessionId = text(order?.sessionId);
  const slug = text(order?.slug).toLowerCase();
  const siteUrl = text(order?.siteUrl);
  const businessName = text(order?.businessName);
  const mainAction = text(order?.mainAction);

  if (!sessionId) throw new Error('Website Upgrade order is missing sessionId.');
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(slug)) {
    throw new Error('Website Upgrade target slug is invalid.');
  }
  if (siteUrl !== `https://3dvr.tech/free-sites/${slug}/`) {
    throw new Error('Website Upgrade target must be the validated 3DVR-hosted free-site URL.');
  }
  if (!businessName) throw new Error('Website Upgrade order is missing businessName.');
  if (!mainAction) throw new Error('Website Upgrade order is missing mainAction.');

  return { sessionId, slug, siteUrl, businessName, mainAction };
}

async function failOrder(state, sessionId, reason, details = {}) {
  return state.transitionOrder(sessionId, 'failed', {
    ...details,
    reason: text(reason).slice(0, 500),
  });
}

async function processUpgradeOrder(order, options = {}) {
  const state = options.state || defaultStateApi();
  const publishUpgrade = options.publishUpgrade;
  const verifyUpgrade = options.verifyUpgrade;
  const sendDelivery = options.sendDelivery;

  if (typeof publishUpgrade !== 'function') throw new Error('publishUpgrade adapter is required.');
  if (typeof verifyUpgrade !== 'function') throw new Error('verifyUpgrade adapter is required.');
  if (typeof sendDelivery !== 'function') throw new Error('sendDelivery adapter is required.');

  let bounded;
  try {
    bounded = validateBoundedOrder(order);
  } catch (error) {
    const sessionId = text(order?.sessionId);
    if (!sessionId) throw error;
    const received = await state.receiveOrder(order);
    if (!received.terminal) {
      const blocked = await state.transitionOrder(sessionId, 'blocked', {
        reason: text(error?.message || error).slice(0, 500),
      });
      return { ok: false, status: 'blocked', record: blocked };
    }
    return { ok: false, status: received.record.status, record: received.record, replay: true };
  }

  const received = await state.receiveOrder(order);
  let record = received.record;

  if (record.status === 'delivered' || record.status === 'blocked') {
    return {
      ok: record.status === 'delivered',
      status: record.status,
      record,
      replay: true,
    };
  }

  // Once an email delivery has been durably reserved, never automatically try
  // the customer-facing side effect again. A crash after SMTP acceptance but
  // before the final state write is intentionally treated as uncertain rather
  // than risking a duplicate customer email.
  if (record.deliveryReservedAt && !record.deliverySentAt) {
    return {
      ok: false,
      status: 'delivery_uncertain',
      record,
      replay: !received.created,
    };
  }

  if (!text(order.customerEmail)) {
    record = await state.transitionOrder(bounded.sessionId, 'blocked', {
      reason: 'Website Upgrade order is missing customer email.',
    });
    return { ok: false, status: 'blocked', record };
  }

  record = await state.transitionOrder(bounded.sessionId, 'processing', {
    publicationKey: publicationKey(bounded.sessionId),
  });

  let publication;
  try {
    publication = await publishUpgrade({
      order,
      record,
      idempotencyKey: publicationKey(bounded.sessionId),
    });
  } catch (error) {
    const failed = await failOrder(state, bounded.sessionId, error?.message || error, {
      stage: 'publish',
      publicationKey: publicationKey(bounded.sessionId),
    });
    return { ok: false, status: 'failed', stage: 'publish', record: failed };
  }

  const finalUrl = text(publication?.siteUrl || order.siteUrl);
  const publicationDetails = {
    publicationKey: publicationKey(bounded.sessionId),
    prUrl: text(publication?.prUrl) || null,
    finalUrl,
  };

  let verified = false;
  try {
    verified = Boolean(await verifyUpgrade({
      order,
      record,
      publication,
      siteUrl: finalUrl,
    }));
  } catch (error) {
    const failed = await failOrder(state, bounded.sessionId, error?.message || error, {
      ...publicationDetails,
      stage: 'verify',
    });
    return { ok: false, status: 'failed', stage: 'verify', record: failed };
  }

  if (!verified) {
    const failed = await failOrder(state, bounded.sessionId, 'Website Upgrade publication could not be verified.', {
      ...publicationDetails,
      stage: 'verify',
    });
    return { ok: false, status: 'failed', stage: 'verify', record: failed };
  }

  const reservation = await state.reserveDelivery(
    bounded.sessionId,
    deliveryKey(bounded.sessionId),
  );
  record = reservation.record;

  if (!reservation.reserved) {
    if (record.status === 'delivered') {
      return { ok: true, status: 'delivered', record, replay: true };
    }
    return {
      ok: false,
      status: 'delivery_uncertain',
      record,
      replay: true,
    };
  }

  try {
    await sendDelivery({
      order,
      record,
      siteUrl: finalUrl,
      idempotencyKey: deliveryKey(bounded.sessionId),
    });
  } catch (error) {
    const failed = await failOrder(state, bounded.sessionId, error?.message || error, {
      ...publicationDetails,
      stage: 'delivery',
      deliveryState: 'uncertain',
    });
    return { ok: false, status: 'delivery_uncertain', stage: 'delivery', record: failed };
  }

  record = await state.transitionOrder(bounded.sessionId, 'delivered', {
    ...publicationDetails,
    stage: 'delivered',
  });
  return { ok: true, status: 'delivered', record };
}

async function processUpgradeOrders(orders, options = {}) {
  const results = [];
  for (const order of Array.isArray(orders) ? orders : []) {
    try {
      results.push(await processUpgradeOrder(order, options));
    } catch (error) {
      results.push({
        ok: false,
        status: 'error',
        sessionId: text(order?.sessionId) || null,
        error: text(error?.message || error).slice(0, 500),
      });
    }
  }
  return results;
}

module.exports = {
  deliveryKey,
  processUpgradeOrder,
  processUpgradeOrders,
  publicationKey,
  validateBoundedOrder,
};

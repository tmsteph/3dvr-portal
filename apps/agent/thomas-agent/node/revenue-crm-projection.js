const { finishProjection, getProspect, pendingProjections } = require('./revenue-ledger');
const { buildLeadId, writeCrmSync } = require('./crm-sync');

function remoteProjectionRoots() {
  const Gun = require('gun');
  const gun = Gun({
    peers: [process.env.THREEDVR_GUN_RELAY || 'wss://gun-relay-3dvr.fly.dev/gun'],
    axe: false,
    multicast: false,
    rad: false,
    radisk: false,
    localStorage: false,
    stats: false,
  });
  return {
    crmRoot: gun.get('3dvr-crm'),
    touchRoot: gun.get(process.env.THREEDVR_GUN_PORTAL_ROOT || '3dvr-portal').get('crm-touch-log'),
  };
}

function paymentReceiptFor(event = {}) {
  let payload = {};
  try { payload = JSON.parse(event.payload_json || '{}'); } catch {}
  const payment = payload.payment && typeof payload.payment === 'object' ? payload.payment : payload;
  const amountCents = Number(payment.amount_cents ?? payment.amountCents ?? payment.amount_paid ?? payment.amount_total);
  const currency = String(payment.currency || 'usd').trim().toUpperCase();
  const paidAt = String(payment.paid_at || payment.paidAt || payment.created_at || event.created_at || '').trim();
  const recurringCents = Number(payment.recurring_cents ?? payment.recurringCents ?? payment.plan_amount_cents);
  const hasAmount = Number.isFinite(amountCents) && amountCents >= 0;
  const hasRecurring = Number.isFinite(recurringCents) && recurringCents >= 0;
  if (!hasAmount && !payment.payment_intent_id && !payment.subscription_id && !payment.plan) return null;
  return {
    amountCents: hasAmount ? amountCents : null,
    amount: hasAmount ? `${currency} ${(amountCents / 100).toFixed(2)}` : '',
    currency,
    paidAt,
    recurringCents: hasRecurring ? recurringCents : null,
    recurringValue: hasRecurring ? `${currency} ${(recurringCents / 100).toFixed(2)}` : '',
    plan: String(payment.plan || payment.plan_name || '').trim(),
    paymentIntentId: String(payment.payment_intent_id || payment.paymentIntentId || '').trim(),
    subscriptionId: String(payment.subscription_id || payment.subscriptionId || '').trim(),
  };
}

function recordFor(prospect, event, now) {
  const paymentReceipt = paymentReceiptFor(event);
  const crmStatus = paymentReceipt ? 'Paid Customer' : ({
    prospect: 'Lead', verified: 'Lead', drafted: 'Lead', eligible: 'Lead',
    sent: 'Warm - Waiting', replied: 'Warm - Discovery', bounced: 'Lost',
    failed: 'Lost', suppressed: 'Closed',
  }[prospect.state] || 'Lead');
  const nextBestAction = paymentReceipt
    ? 'Activate the customer, deliver value, and capture proof/outcome. Do not schedule a sales follow-up because payment occurred.'
    : ({
      sent: 'Wait for reply or a genuinely new material reason to contact. Do not schedule an automatic sales follow-up.',
      replied: 'Continue discovery from the customer reply.',
      bounced: 'Do not contact.',
      suppressed: 'Do not contact.',
    }[prospect.state] || 'Follow the canonical revenue state machine.');
  const paymentSignal = paymentReceipt
    ? `Successful payment${paymentReceipt.amount ? `: ${paymentReceipt.amount}` : ''}${paymentReceipt.plan ? ` (${paymentReceipt.plan})` : ''}`
    : '';
  return {
    id: buildLeadId({ name: prospect.name, contact: prospect.contact, link: prospect.source_url }),
    recordType: 'person',
    name: prospect.name,
    company: prospect.name,
    email: /@/.test(prospect.contact) ? prospect.contact.replace(/^mailto:/i, '') : '',
    status: crmStatus,
    canonicalState: prospect.state,
    source: '3dvr-revenue-ledger',
    campaignId: prospect.campaign_id,
    lastSignal: paymentSignal || `Canonical revenue state: ${prospect.state}`,
    nextBestAction,
    created: prospect.created_at,
    updated: now,
    canonicalEventId: event.id,
    ...(paymentReceipt ? {
      lastPaymentAmountCents: paymentReceipt.amountCents,
      lastPaymentAmount: paymentReceipt.amount,
      lastPaymentCurrency: paymentReceipt.currency,
      lastPaymentAt: paymentReceipt.paidAt,
      recurringPlanValueCents: paymentReceipt.recurringCents,
      recurringPlanValue: paymentReceipt.recurringValue,
      billingPlan: paymentReceipt.plan,
      stripePaymentIntentId: paymentReceipt.paymentIntentId,
      stripeSubscriptionId: paymentReceipt.subscriptionId,
    } : {}),
  };
}

function touchFor(prospect, event, now) {
  const recordId = buildLeadId({ name: prospect.name, contact: prospect.contact, link: prospect.source_url });
  return {
    id: `revenue-event-${event.id}`,
    recordId,
    crmRecordId: recordId,
    contactName: prospect.name,
    type: 'note',
    touchType: event.type,
    summary: `${event.from_state || 'import'} -> ${event.to_state}`,
    source: '3dvr-revenue-ledger',
    created: event.created_at,
    updated: now,
  };
}

async function projectPendingCrm(db, options = {}) {
  const write = options.write || writeCrmSync;
  const writeOptions = options.writeOptions || (options.write ? {} : remoteProjectionRoots());
  const rows = pendingProjections(db, options.limit || 100);
  const result = { attempted: rows.length, succeeded: 0, failed: 0, errors: [] };
  for (const row of rows) {
    const prospect = getProspect(db, row.prospect_id);
    const event = db.prepare('SELECT * FROM revenue_events WHERE id = ?').get(row.event_id);
    try {
      if (!(prospect && event)) throw new Error('Projection references missing canonical data');
      const now = new Date().toISOString();
      const response = await write({ records: [recordFor(prospect, event, now)], touches: [touchFor(prospect, event, now)] }, writeOptions);
      if (response?.errors?.length) throw new Error(response.errors.join('; '));
      finishProjection(db, { id: row.id, status: 'succeeded' });
      result.succeeded += 1;
    } catch (error) {
      const message = String(error?.message || error);
      finishProjection(db, { id: row.id, status: 'failed', error: message });
      result.failed += 1;
      result.errors.push(message);
    }
  }
  return result;
}

module.exports = { paymentReceiptFor, projectPendingCrm, recordFor, remoteProjectionRoots, touchFor };

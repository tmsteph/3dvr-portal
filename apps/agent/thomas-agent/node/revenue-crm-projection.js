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
  // Ordinary ledger transitions may carry payment-shaped metadata; only a
  // specifically recorded payment success event can affect paid CRM status.
  if (event.type !== 'payment_succeeded') return null;
  let payload = {};
  try { payload = JSON.parse(event.payload_json || '{}'); } catch {}
  const payment = payload.payment && typeof payload.payment === 'object' ? payload.payment : payload;
  const amountCents = Number(payment.amount_cents ?? payment.amountCents ?? payment.amount_paid ?? payment.amount_total);
  const currency = String(payment.currency || 'usd').trim().toUpperCase();
  const paidAt = String(payment.paid_at || payment.paidAt || payment.created_at || event.created_at || '').trim();
  const recurringCents = Number(payment.recurring_cents ?? payment.recurringCents ?? payment.plan_amount_cents);
  const hasAmount = Number.isSafeInteger(amountCents) && amountCents > 0;
  const hasRecurring = Number.isSafeInteger(recurringCents) && recurringCents >= 0;
  const providerReceiptId = String(payment.payment_intent_id || payment.paymentIntentId || payment.invoice_id || payment.invoiceId || payment.charge_id || payment.chargeId || '').trim();
  const paymentStatus = String(payment.status || payment.payment_status || '').trim().toLowerCase();
  // A plan/subscription, zero-value checkout, or absent/pending payment status
  // is not proof of settlement. Require explicit paid/succeeded state, while
  // upstream still must authenticate the provider event before recording it.
  if (!hasAmount || !providerReceiptId || !['paid', 'succeeded'].includes(paymentStatus)) return null;
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

// Project the latest structurally valid payment at or before this event. A
// later CRM sync must not erase an earlier payment simply because the new
// ledger event is a note/state change. Never peek at future payment events.
function latestPaymentEventThrough(db, prospectId, eventId) {
  const rows = db.prepare(`SELECT * FROM revenue_events
    WHERE prospect_id = ? AND type = 'payment_succeeded'
      AND rowid <= (SELECT rowid FROM revenue_events WHERE id = ?)
    ORDER BY rowid DESC`).all(prospectId, eventId);
  return rows.find(row => paymentReceiptFor(row)) || null;
}

function recordFor(prospect, event, now, paymentEvent = event) {
  // Outbox entries represent historical transitions. Using the prospect's
  // latest state here leaks future activity into older projection records.
  const canonicalState = event.to_state || prospect.state;
  const paymentReceipt = paymentReceiptFor(paymentEvent || {});
  const crmStatus = paymentReceipt ? 'Paid Customer' : ({
    prospect: 'Lead', verified: 'Lead', drafted: 'Lead', eligible: 'Lead',
    sent: 'Warm - Waiting', replied: 'Warm - Discovery', bounced: 'Lost',
    failed: 'Lost', suppressed: 'Closed',
  }[canonicalState] || 'Lead');
  const nextBestAction = ['suppressed', 'bounced'].includes(canonicalState)
    ? 'Do not contact.'
    : paymentReceipt
    ? 'Activate the customer, deliver value, and capture proof/outcome. Do not schedule a sales follow-up because payment occurred.'
    : ({
      sent: 'Wait for reply or a genuinely new material reason to contact. Do not schedule an automatic sales follow-up.',
      replied: 'Continue discovery from the customer reply.',
      bounced: 'Do not contact.',
      suppressed: 'Do not contact.',
    }[canonicalState] || 'Follow the canonical revenue state machine.');
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
    canonicalState,
    source: '3dvr-revenue-ledger',
    campaignId: prospect.campaign_id,
    lastSignal: paymentSignal || `Canonical revenue state: ${canonicalState}`,
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
  const result = { attempted: 0, succeeded: 0, failed: 0, blocked: 0, errors: [] };
  // A failed earlier projection must block later events for the same lead.
  // Leave them pending for the next run rather than regressing CRM state.
  const blockedProspects = new Set();
  for (const row of rows) {
    if (blockedProspects.has(row.prospect_id)) {
      result.blocked += 1;
      continue;
    }
    result.attempted += 1;
    const prospect = getProspect(db, row.prospect_id);
    const event = db.prepare('SELECT * FROM revenue_events WHERE id = ?').get(row.event_id);
    try {
      if (!(prospect && event)) throw new Error('Projection references missing canonical data');
      const now = new Date().toISOString();
      const paymentEvent = latestPaymentEventThrough(db, prospect.id, event.id);
      const response = await write({ records: [recordFor(prospect, event, now, paymentEvent)], touches: [touchFor(prospect, event, now)] }, writeOptions);
      if (response?.errors?.length) throw new Error(response.errors.join('; '));
      finishProjection(db, { id: row.id, status: 'succeeded' });
      result.succeeded += 1;
    } catch (error) {
      blockedProspects.add(row.prospect_id);
      const message = String(error?.message || error);
      finishProjection(db, { id: row.id, status: 'failed', error: message });
      result.failed += 1;
      result.errors.push(message);
    }
  }
  return result;
}

module.exports = { paymentReceiptFor, projectPendingCrm, recordFor, remoteProjectionRoots, touchFor };

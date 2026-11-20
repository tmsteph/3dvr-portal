const { finishProjection, getProspect, pendingProjections } = require('./revenue-ledger');
const { buildLeadId, writeCrmSync } = require('./crm-sync');

// #3774: An isolated acceptance check must never silently fall back to the
// production Gun relay. Resolve and validate the peer before initializing Gun.
function projectionPeer(options = {}) {
  if (options.isolated === true) {
    const relay = typeof options.relayUrl === 'string' ? options.relayUrl.trim() : '';
    if (!relay) throw new Error('Isolated CRM relay requires an explicit loopback URL');
    let parsed;
    try { parsed = new URL(relay); } catch { throw new Error('Invalid isolated CRM relay URL'); }
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
    const allowedProtocol = ['ws:', 'wss:', 'http:', 'https:'].includes(parsed.protocol);
    if (!loopback || !allowedProtocol || !parsed.port || parsed.username || parsed.password
      || !['/gun', '/gun/'].includes(parsed.pathname) || parsed.search || parsed.hash) {
      throw new Error('Isolated CRM relay must be an explicit loopback /gun endpoint with a port and no credentials');
    }
    return parsed.href;
  }
  return options.relayUrl || process.env.THREEDVR_GUN_RELAY || 'wss://portal.3dvr.tech/gun-relay';
}

function remoteProjectionRoots(options = {}) {
  const peer = projectionPeer(options);
  const Gun = require('gun');
  const gun = Gun({
    peers: [peer],
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

function paymentReceiptFor(_event = {}) {
  // Revenue ledger transitions intentionally reject caller-authored
  // "payment_succeeded" records. A CRM projection cannot authenticate a
  // provider callback by checking a status string, amount and payment ID.
  //
  // There is no trusted payment-adapter receipt attached to this projection.
  // Fail closed until an independently authenticated provider integration
  // passes verified payment evidence to the CRM (with replay/identity checks).
  // Never let a forged or manually inserted event label a lead "Paid Customer".
  return null;
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
  // The isolated acceptance fence must not be bypassed by caller-supplied
  // production Gun roots. Only an explicitly injected offline test writer may
  // receive custom roots; the real writer must construct verified loopback roots.
  if (options.isolated === true && !options.write && options.writeOptions) {
    throw new Error('Isolated CRM projection cannot override Gun roots');
  }
  const writeOptions = options.writeOptions || (options.write ? {} : remoteProjectionRoots(options));
  const rows = pendingProjections(db, options.limit || 100);
  const result = { attempted: rows.length, succeeded: 0, failed: 0, errors: [] };
  for (const row of rows) {
    const prospect = getProspect(db, row.prospect_id);
    const event = db.prepare('SELECT * FROM revenue_events WHERE id = ?').get(row.event_id);
    try {
      if (!(prospect && event)) throw new Error('Projection references missing canonical data');
      // Both FKs can be valid while an outbox row points to another lead's
      // event. Never project that person's reply/payment into this CRM record.
      if (event.prospect_id !== prospect.id) {
        throw new Error('CRM projection prospect/event identity mismatch');
      }
      const now = new Date().toISOString();
      const payload = {
        records: [recordFor(prospect, event, now)],
        touches: [touchFor(prospect, event, now)],
      };
      const response = await write(payload, writeOptions);
      // A writer that returns nothing (or acknowledges only some writes) must
      // never clear the retryable outbox entry. This checks the writer's receipt,
      // not durable readback from an independent CRM client.
      if (!response || !Array.isArray(response.errors)) {
        throw new Error('CRM projection missing a structured write receipt');
      }
      if (response.errors.length) throw new Error(response.errors.join('; '));
      if (response.records !== payload.records.length || response.touches !== payload.touches.length) {
        throw new Error('CRM projection missing affirmative record/touch write counts');
      }
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

module.exports = { paymentReceiptFor, projectPendingCrm, projectionPeer, recordFor, remoteProjectionRoots, touchFor };

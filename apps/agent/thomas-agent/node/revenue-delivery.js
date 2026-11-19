const { finishDeliveryAttempt, getProspect, reserveDeliveryAttempt, transitionProspect } = require('./revenue-ledger');

async function deliverProspect(db, input = {}, send) {
  if (typeof send !== 'function') throw new Error('send function is required');
  const attemptId = String(input.attemptId || '').trim();
  if (!attemptId) throw new Error('attemptId is required');
  // A direct caller must not bypass the worker's eligibility and manual
  // reconciliation checks. Otherwise the sender can be invoked for a
  // suppressed, bounced or already-contacted prospect before the ledger
  // rejects the state transition (too late to undo an external email).
  // Preserve idempotent reads of the original attempt after its state changes.
  const existing = db.prepare('SELECT prospect_id FROM delivery_attempts WHERE attempt_key = ?').get(attemptId);
  if (!existing) {
    const prospect = getProspect(db, input.prospectId);
    if (!prospect || prospect.state !== 'eligible') {
      throw new Error('Prospect must be eligible before delivery');
    }
    const prior = db.prepare('SELECT attempt_key FROM delivery_attempts WHERE prospect_id = ? LIMIT 1').get(prospect.id);
    if (prior) {
      throw new Error('Prior delivery attempt requires manual reconciliation before a new attempt');
    }
  }
  const reserved = reserveDeliveryAttempt(db, { attemptId, prospectId: input.prospectId });
  if (reserved.replayed) {
    const error = reserved.attempt.status === 'in_flight'
      ? 'Delivery attempt is ambiguous after interruption; refusing to resend'
      : reserved.attempt.error;
    return {
      prospect: getProspect(db, input.prospectId),
      replayed: true,
      error,
      attempt: reserved.attempt,
    };
  }
  let receipt;
  try {
    receipt = await send();
    if (!receipt || receipt.acknowledged !== true
      || typeof receipt.messageId !== 'string' || !receipt.messageId.trim()
      || typeof receipt.transport !== 'string' || !receipt.transport.trim()) {
      // A process exiting successfully or a caller-supplied boolean alone
      // cannot establish a provider-attributable send. Keep an ambiguous
      // attempt quarantined rather than advance the CRM to "sent".
      throw new Error('Sender did not return an attributable delivery acknowledgement');
    }
  } catch (error) {
    const failed = transitionProspect(db, {
      prospectId: input.prospectId,
      toState: 'failed',
      type: 'delivery_failed',
      idempotencyKey: `delivery:${attemptId}:failed`,
      payload: { error: String(error?.message || error) },
    });
    finishDeliveryAttempt(db, { attemptId, status: 'failed', error: String(error?.message || error) });
    return { ...failed, error: String(error?.message || error) };
  }
  try {
    const sent = transitionProspect(db, {
      prospectId: input.prospectId,
      toState: 'sent',
      type: 'delivery_acknowledged',
      idempotencyKey: `delivery:${attemptId}:sent`,
      payload: { messageId: String(receipt.messageId || ''), transport: String(receipt.transport || '') },
    });
    finishDeliveryAttempt(db, {
      attemptId,
      status: 'acknowledged',
      messageId: receipt.messageId,
      transport: receipt.transport,
    });
    return { ...sent, attempt: reserved.attempt };
  } catch (error) {
    return {
      prospect: getProspect(db, input.prospectId),
      replayed: false,
      error: `Sender acknowledged but ledger finalization failed: ${error?.message || error}`,
      attempt: reserved.attempt,
    };
  }
}

module.exports = { deliverProspect };

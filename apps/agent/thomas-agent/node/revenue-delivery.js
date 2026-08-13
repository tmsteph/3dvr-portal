const { finishDeliveryAttempt, getProspect, reserveDeliveryAttempt, transitionProspect } = require('./revenue-ledger');

async function deliverProspect(db, input = {}, send) {
  if (typeof send !== 'function') throw new Error('send function is required');
  const attemptId = String(input.attemptId || '').trim();
  if (!attemptId) throw new Error('attemptId is required');
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
    if (!receipt || receipt.acknowledged !== true) throw new Error('Sender did not return an acknowledgement');
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

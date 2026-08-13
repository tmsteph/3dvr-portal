const { transitionProspect } = require('./revenue-ledger');

async function deliverProspect(db, input = {}, send) {
  if (typeof send !== 'function') throw new Error('send function is required');
  const attemptId = String(input.attemptId || '').trim();
  if (!attemptId) throw new Error('attemptId is required');
  try {
    const receipt = await send();
    if (!receipt || receipt.acknowledged !== true) throw new Error('Sender did not return an acknowledgement');
    return transitionProspect(db, {
      prospectId: input.prospectId,
      toState: 'sent',
      type: 'delivery_acknowledged',
      idempotencyKey: `delivery:${attemptId}:sent`,
      payload: { messageId: String(receipt.messageId || ''), transport: String(receipt.transport || '') },
    });
  } catch (error) {
    const failed = transitionProspect(db, {
      prospectId: input.prospectId,
      toState: 'failed',
      type: 'delivery_failed',
      idempotencyKey: `delivery:${attemptId}:failed`,
      payload: { error: String(error?.message || error) },
    });
    return { ...failed, error: String(error?.message || error) };
  }
}

module.exports = { deliverProspect };

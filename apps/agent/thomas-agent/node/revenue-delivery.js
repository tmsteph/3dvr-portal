// Legacy direct delivery was previously callable with an arbitrary injected
// sender and no authenticated, recipient-and-content-bound human approval.
// Keep this API fail-closed even when invoked outside the scheduled worker.
// An approval system must verify identity, message digest, expiry and single use
// before any sender is ever reintroduced. A caller-supplied flag is not proof.
async function deliverProspect() {
  throw new Error('Outbound delivery disabled until authenticated per-message human approval and delivery verification exist');
}

module.exports = { deliverProspect };

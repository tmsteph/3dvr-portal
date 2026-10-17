/** Experimental UCN v0.1: simulated obligations only. No payments or credit issuance. */
export type Currency = 'USD';
export type Obligation = Readonly<{
  id: string;
  issuer: string;
  creditor: string;
  amountMinor: number;
  currency: Currency;
  createdAt: string;
  dueAt: string;
  termsHash: string;
}>;
export type EventKind = 'issued' | 'accepted' | 'settled' | 'disputed' | 'closed';
export type CreditEvent = Readonly<{
  id: string;
  obligationId: string;
  kind: EventKind;
  actor: string;
  amountMinor?: number;
  timestamp: string;
}>;
export type State = Readonly<{
  status: 'issued' | 'accepted' | 'disputed' | 'closed';
  outstandingMinor: number;
  settledMinor: number;
}>;
export function validateObligation(o: Obligation): void {
  if (!o.id || !o.issuer || !o.creditor || o.issuer === o.creditor) throw new Error('Invalid parties or ID');
  if (!Number.isSafeInteger(o.amountMinor) || o.amountMinor <= 0) throw new Error('Invalid amount');
  if (o.currency !== 'USD' || !o.termsHash) throw new Error('Invalid denomination or terms');
  if (!Number.isFinite(Date.parse(o.createdAt)) || !Number.isFinite(Date.parse(o.dueAt)) || Date.parse(o.dueAt) < Date.parse(o.createdAt)) throw new Error('Invalid dates');
}
export function reduceObligation(o: Obligation, events: readonly CreditEvent[]): State {
  validateObligation(o);
  let status: State['status'] = 'issued';
  let settledMinor = 0;
  let issued = false;
  let previousTime = Date.parse(o.createdAt);
  const ids = new Set<string>();
  for (const e of events) {
    if (!e.id || ids.has(e.id)) throw new Error('Duplicate/invalid event ID');
    ids.add(e.id);
    if (e.obligationId !== o.id || !Number.isFinite(Date.parse(e.timestamp))) throw new Error('Invalid event');
    const eventTime = Date.parse(e.timestamp);
    if (eventTime < previousTime) throw new Error('Events must be chronologically ordered');
    previousTime = eventTime;
    if (!issued && e.kind !== 'issued') throw new Error('Issuance required before other events');
    if (e.kind !== 'settled' && e.amountMinor !== undefined) throw new Error('Unexpected event amount');
    switch (e.kind) {
      case 'issued':
        if (issued || status !== 'issued' || e.actor !== o.issuer || settledMinor !== 0) throw new Error('Invalid issue');
        issued = true;
        break;
      case 'accepted':
        if (status !== 'issued' || e.actor !== o.creditor) throw new Error('Invalid acceptance');
        status = 'accepted'; break;
      case 'settled':
        if (status !== 'accepted' || e.actor !== o.creditor || !Number.isSafeInteger(e.amountMinor) || (e.amountMinor ?? 0) <= 0 || settledMinor + (e.amountMinor ?? 0) > o.amountMinor) throw new Error('Invalid settlement');
        settledMinor += e.amountMinor!; break;
      case 'disputed':
        if (status !== 'accepted' || ![o.issuer, o.creditor].includes(e.actor)) throw new Error('Invalid dispute');
        status = 'disputed'; break;
      case 'closed':
        if (status !== 'accepted' || e.actor !== o.creditor || settledMinor !== o.amountMinor) throw new Error('Invalid closure');
        status = 'closed'; break;
      default: throw new Error('Unknown event');
    }
  }
  if (!issued) throw new Error('Missing issuance event');
  return { status, outstandingMinor: o.amountMinor - settledMinor, settledMinor };
}

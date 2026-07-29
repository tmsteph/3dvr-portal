export const QUOTE_STATUS_OPTIONS = Object.freeze([
  'Draft',
  'Sent',
  'Approved',
  'Payment link created',
  'Paid',
  'Cancelled',
]);

function cleanText(value, limit = 240) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, limit);
}

export function moneyToCents(value) {
  const normalized = String(value ?? '').replace(/[$,\s]/g, '');
  if (!normalized) return 0;
  const amount = Number(normalized);
  return Number.isFinite(amount) ? Math.max(0, Math.round(amount * 100)) : 0;
}

export function centsToMoney(value) {
  const cents = Number.isFinite(Number(value)) ? Number(value) : 0;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

export function normalizeQuoteItem(item = {}) {
  const quantity = Math.max(1, Number.parseInt(item.quantity, 10) || 1);
  return {
    id: cleanText(item.id, 80) || `item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    description: cleanText(item.description, 160),
    quantity,
    unitPriceCents: Number.isFinite(Number(item.unitPriceCents))
      ? Math.max(0, Math.round(Number(item.unitPriceCents)))
      : moneyToCents(item.unitPrice),
    unitCostCents: Number.isFinite(Number(item.unitCostCents))
      ? Math.max(0, Math.round(Number(item.unitCostCents)))
      : moneyToCents(item.unitCost),
  };
}

export function calculateQuoteTotals(quote = {}) {
  const items = (Array.isArray(quote.items) ? quote.items : [])
    .map(normalizeQuoteItem)
    .filter(item => item.description);
  const subtotalCents = items.reduce(
    (sum, item) => sum + (item.quantity * item.unitPriceCents),
    0
  );
  const internalCostCents = items.reduce(
    (sum, item) => sum + (item.quantity * item.unitCostCents),
    0
  );
  const shippingCents = moneyToCents(
    quote.shippingCents != null ? Number(quote.shippingCents) / 100 : quote.shipping
  );
  const taxRate = Math.min(100, Math.max(0, Number(quote.taxRate) || 0));
  const taxCents = Math.round(subtotalCents * (taxRate / 100));
  const totalCents = subtotalCents + taxCents + shippingCents;

  return {
    items,
    subtotalCents,
    internalCostCents,
    marginCents: subtotalCents - internalCostCents,
    taxRate,
    taxCents,
    shippingCents,
    totalCents,
  };
}

export function sanitizeQuote(input = {}) {
  let inputItems = input.items;
  if (!Array.isArray(inputItems) && input.itemsJson) {
    try {
      inputItems = JSON.parse(input.itemsJson);
    } catch {
      inputItems = [];
    }
  }
  const totals = calculateQuoteTotals({ ...input, items: inputItems });
  const now = new Date().toISOString();
  return {
    id: cleanText(input.id, 100),
    reference: cleanText(input.reference, 80),
    crmRecordId: cleanText(input.crmRecordId, 100),
    customerName: cleanText(input.customerName, 120),
    customerEmail: cleanText(input.customerEmail, 200).toLowerCase(),
    status: QUOTE_STATUS_OPTIONS.includes(input.status) ? input.status : 'Draft',
    items: totals.items,
    taxRate: totals.taxRate,
    shippingCents: totals.shippingCents,
    subtotalCents: totals.subtotalCents,
    taxCents: totals.taxCents,
    totalCents: totals.totalCents,
    internalCostCents: totals.internalCostCents,
    marginCents: totals.marginCents,
    artworkNotes: cleanText(input.artworkNotes, 600),
    terms: cleanText(input.terms, 600),
    paymentUrl: cleanText(input.paymentUrl, 500),
    stripeSessionId: cleanText(input.stripeSessionId, 120),
    created: cleanText(input.created, 40) || now,
    updated: now,
  };
}

export function quoteToGunData(quote = {}) {
  const safeQuote = sanitizeQuote(quote);
  const { items, ...fields } = safeQuote;
  return {
    ...fields,
    itemsJson: JSON.stringify(items),
  };
}

export function quoteFromGunData(data = {}) {
  return sanitizeQuote(data);
}

export function buildCrmQuoteFields(quote = {}) {
  const safeQuote = sanitizeQuote(quote);
  return {
    quoteId: safeQuote.id,
    quoteReference: safeQuote.reference,
    quoteStatus: safeQuote.status,
    quoteTotalCents: safeQuote.totalCents,
    quotePaymentUrl: safeQuote.paymentUrl,
    quoteUpdated: safeQuote.updated,
    offerAmount: centsToMoney(safeQuote.totalCents),
    updated: safeQuote.updated,
  };
}

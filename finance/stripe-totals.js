export function normalizeStripeAmount(value) {
  const numeric = typeof value === 'number' ? value : parseFloat(String(value).replace(/[^0-9.-]/g, ''));
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.round(numeric * 100) / 100;
}

export function computeStripeTotals(reports = []) {
  const summary = {
    gross: 0,
    fees: 0,
    net: 0,
    lastPayout: null
  };

  if (!Array.isArray(reports) || reports.length === 0) {
    return summary;
  }

  let latestPayout = null;

  reports.forEach(entry => {
    summary.gross += normalizeStripeAmount(entry.grossVolume || entry.gross || 0);
    summary.fees += normalizeStripeAmount(entry.fees || 0);
    summary.net += normalizeStripeAmount(
      entry.net !== undefined ? entry.net : (entry.grossVolume || entry.gross || 0) - (entry.fees || 0) - (entry.refunds || 0)
    );

    if (entry.payoutDate) {
      const payoutDate = new Date(entry.payoutDate);
      if (!Number.isNaN(payoutDate.getTime()) && (!latestPayout || payoutDate > latestPayout)) {
        latestPayout = payoutDate;
      }
    }
  });

  summary.lastPayout = latestPayout;
  return summary;
}

if (typeof globalThis !== 'undefined') {
  globalThis.FinanceStripeTotals = {
    computeStripeTotals,
    normalizeStripeAmount
  };

  if (typeof globalThis.dispatchEvent === 'function' && typeof globalThis.CustomEvent === 'function') {
    const readyEvent = new CustomEvent('finance:stripe-totals-ready');
    globalThis.dispatchEvent(readyEvent);
  }
}

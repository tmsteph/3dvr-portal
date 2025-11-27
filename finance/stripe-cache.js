const stripeReportsStorageKey = 'finance.stripeReports';

function isStorageAvailable(store) {
  return !!store && typeof store.getItem === 'function' && typeof store.setItem === 'function';
}

export function loadStripeReportsCache(storage = globalThis.localStorage) {
  if (!isStorageAvailable(storage)) {
    return [];
  }

  try {
    const raw = storage.getItem(stripeReportsStorageKey);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(record => record && typeof record === 'object') : [];
  } catch (err) {
    console.warn('Unable to load cached Stripe reports', err);
    return [];
  }
}

export function saveStripeReportsCache(reports, storage = globalThis.localStorage) {
  if (!isStorageAvailable(storage) || !Array.isArray(reports)) {
    return;
  }

  try {
    storage.setItem(stripeReportsStorageKey, JSON.stringify(reports));
  } catch (err) {
    console.warn('Unable to persist Stripe reports cache', err);
  }
}

export { stripeReportsStorageKey };

if (typeof globalThis !== 'undefined') {
  globalThis.FinanceStripeCache = {
    loadStripeReportsCache,
    saveStripeReportsCache,
    stripeReportsStorageKey
  };
}

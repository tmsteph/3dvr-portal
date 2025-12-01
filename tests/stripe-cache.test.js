import assert from 'node:assert/strict';
import test from 'node:test';
import { loadStripeReportsCache, saveStripeReportsCache, stripeReportsStorageKey } from '../finance/stripe-cache.js';

function createMockStorage() {
  const store = new Map();
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, value);
    }
  };
}

test('loadStripeReportsCache returns sanitized array or empty on invalid data', () => {
  const storage = createMockStorage();
  storage.setItem(stripeReportsStorageKey, JSON.stringify([{ id: 'stripe-1', grossVolume: 100 }]));

  assert.deepEqual(loadStripeReportsCache(storage), [{ id: 'stripe-1', grossVolume: 100 }]);

  storage.setItem(stripeReportsStorageKey, 'not-json');
  assert.deepEqual(loadStripeReportsCache(storage), []);
});

test('saveStripeReportsCache writes reports when storage is available', () => {
  const storage = createMockStorage();
  const reports = [{ id: 'stripe-2', grossVolume: 250.5, fees: 12.5 }];

  saveStripeReportsCache(reports, storage);
  assert.equal(storage.getItem(stripeReportsStorageKey), JSON.stringify(reports));
});

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatSyncTimestamp,
  getLatestRecordUpdatedAt,
  normalizeStripeCustomerRecord,
  syncStripeCustomerSummaries,
} from '../finance/stripe-sync.js';

test('normalizeStripeCustomerRecord cleans Stripe customer summaries', () => {
  const record = normalizeStripeCustomerRecord({
    aggregateKey: 'Test@Example.com ',
    customerId: 'cus_123',
    customerIds: ['cus_123', '', null],
    email: 'Test@Example.com ',
    name: ' Test Name ',
    currency: 'usd',
    amountPaid: '4200',
    invoiceCount: '3',
    lastInvoiceAt: '2026-03-31T12:00:00.000Z',
    updatedAt: '2026-03-31T12:05:00.000Z',
  });

  assert.deepEqual(record, {
    aggregateKey: 'Test@Example.com',
    customerId: 'cus_123',
    customerIds: ['cus_123'],
    email: 'test@example.com',
    name: 'Test Name',
    currency: 'USD',
    amountPaid: 4200,
    invoiceCount: 3,
    lastInvoiceAt: '2026-03-31T12:00:00.000Z',
    updatedAt: '2026-03-31T12:05:00.000Z',
  });
});

test('getLatestRecordUpdatedAt returns the latest timestamp and formatSyncTimestamp handles fallbacks', () => {
  const latest = getLatestRecordUpdatedAt({
    first: { updatedAt: '2026-03-30T08:00:00.000Z' },
    second: { updatedAt: '2026-03-31T09:15:00.000Z' },
  });

  assert.equal(latest, '2026-03-31T09:15:00.000Z');
  assert.match(formatSyncTimestamp(latest), /[A-Z][a-z]{2} \d{1,2}, \d{1,2}:\d{2}/);
  assert.equal(formatSyncTimestamp('', { fallback: 'Never synced' }), 'Never synced');
});

test('syncStripeCustomerSummaries fetches the shared Stripe customer summary feed and prunes stale keys', async () => {
  const originalFetch = globalThis.fetch;
  const puts = [];
  const localIndex = {
    stale: { aggregateKey: 'stale', updatedAt: '2026-03-01T00:00:00.000Z' },
  };
  const customersNode = {
    get(key) {
      return {
        put(value, callback) {
          puts.push({ key, value });
          if (typeof callback === 'function') {
            callback({ ok: 1 });
          }
        },
      };
    },
  };

  globalThis.fetch = async (url) => {
    assert.equal(url, '/api/stripe/customers');
    return {
      ok: true,
      async json() {
        return {
          customers: [
            {
              email: 'builder@example.com',
              customerId: 'cus_builder',
              amountPaid: 5000,
              invoiceCount: 2,
            },
          ],
        };
      },
    };
  };

  try {
    const result = await syncStripeCustomerSummaries({
      customersNode,
      currentRecords: localIndex,
      applyRecord(key, record) {
        localIndex[key] = record;
      },
      removeRecord(key) {
        delete localIndex[key];
      },
    });

    assert.equal(result.count, 1);
    assert.equal(result.synced, true);
    assert.ok(localIndex['builder@example.com']);
    assert.equal(localIndex.stale, undefined);
    assert.equal(puts.length, 2);
    assert.equal(puts[0].key, 'builder@example.com');
    assert.equal(puts[0].value.aggregateKey, 'builder@example.com');
    assert.equal(puts[1].key, 'stale');
    assert.equal(puts[1].value, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

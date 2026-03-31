function toTimestampMs(value) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value;
  }

  const parsed = Date.parse(String(value || '').trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizeStripeCustomerRecord(record = {}) {
  const amountPaid = Number(record.amountPaid);
  const invoiceCount = Number(record.invoiceCount);
  const currency = String(record.currency || 'USD').trim().toUpperCase() || 'USD';
  const aggregateKey = String(record.aggregateKey || record.email || record.customerId || '').trim();
  const customerId = String(record.customerId || aggregateKey).trim();
  const customerIds = Array.isArray(record.customerIds)
    ? record.customerIds.map(value => String(value || '').trim()).filter(Boolean)
    : [];

  return {
    aggregateKey,
    customerId,
    customerIds,
    email: String(record.email || '').trim().toLowerCase(),
    name: String(record.name || '').trim(),
    currency,
    amountPaid: Number.isFinite(amountPaid) ? amountPaid : 0,
    invoiceCount: Number.isFinite(invoiceCount) ? invoiceCount : 0,
    lastInvoiceAt: record.lastInvoiceAt || null,
    updatedAt: String(record.updatedAt || '').trim(),
  };
}

export function getLatestRecordUpdatedAt(records = {}, normalizer = value => value) {
  let latestMs = 0;

  Object.values(records || {}).forEach(rawRecord => {
    const record = typeof normalizer === 'function'
      ? normalizer(rawRecord)
      : rawRecord;
    if (!record || typeof record !== 'object') {
      return;
    }

    const timestamp = record.updatedAt || record.lastInvoiceAt || '';
    const timestampMs = toTimestampMs(timestamp);
    if (timestampMs > latestMs) {
      latestMs = timestampMs;
    }
  });

  return latestMs ? new Date(latestMs).toISOString() : '';
}

export function formatSyncTimestamp(value, { fallback = 'Not synced yet' } = {}) {
  const timestampMs = toTimestampMs(value);
  if (!timestampMs) {
    return fallback;
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(timestampMs));
}

function putNodeValue(node, value) {
  return new Promise((resolve, reject) => {
    if (!node || typeof node.put !== 'function') {
      resolve();
      return;
    }

    let settled = false;
    const timer = globalThis.setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      resolve();
    }, 1500);

    try {
      node.put(value, ack => {
        if (settled) {
          return;
        }
        settled = true;
        globalThis.clearTimeout(timer);
        if (ack && ack.err) {
          reject(new Error(String(ack.err)));
          return;
        }
        resolve();
      });
    } catch (error) {
      if (!settled) {
        settled = true;
        globalThis.clearTimeout(timer);
      }
      reject(error);
    }
  });
}

export async function syncStripeCustomerSummaries({
  customersNode = null,
  currentRecords = {},
  applyRecord = null,
  removeRecord = null,
} = {}) {
  if (typeof globalThis.fetch !== 'function') {
    throw new Error('Fetch is unavailable in this browser.');
  }

  const response = await globalThis.fetch('/api/stripe/customers');
  if (!response.ok) {
    throw new Error(`Stripe API responded with ${response.status}`);
  }

  const payload = await response.json();
  const customers = Array.isArray(payload.customers) ? payload.customers : [];
  const updatedAt = new Date().toISOString();
  const nextKeys = new Set();
  const writes = [];

  customers.forEach((rawRecord, index) => {
    const normalized = normalizeStripeCustomerRecord({ ...rawRecord, updatedAt });
    const key = normalized.aggregateKey || normalized.email || normalized.customerId || `customer-${index + 1}`;
    if (!key) {
      return;
    }

    const record = {
      ...normalized,
      aggregateKey: key,
      customerId: normalized.customerId || key,
      updatedAt,
    };

    nextKeys.add(key);
    if (typeof applyRecord === 'function') {
      applyRecord(key, record);
    }

    if (customersNode && typeof customersNode.get === 'function') {
      writes.push(putNodeValue(customersNode.get(key), record));
    }
  });

  Object.keys(currentRecords || {}).forEach(existingKey => {
    if (!existingKey || nextKeys.has(existingKey)) {
      return;
    }

    if (typeof removeRecord === 'function') {
      removeRecord(existingKey);
    }

    if (customersNode && typeof customersNode.get === 'function') {
      writes.push(putNodeValue(customersNode.get(existingKey), null));
    }
  });

  await Promise.all(writes);

  return {
    count: customers.length,
    updatedAt,
    synced: Boolean(customersNode && typeof customersNode.get === 'function'),
  };
}

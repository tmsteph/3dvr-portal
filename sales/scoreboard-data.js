export const DEFAULT_WEEKLY_PLAN = Object.freeze({
  outreachGoal: 15,
  replyGoal: 3,
  closeGoal: 1,
  depositGoal: 1,
  depositCount: 0,
  weeklyCashCollected: 0,
  productMove: '',
  revenueMove: '',
  systemMove: '',
  blocker: '',
});

const PAID_PLAN_SET = new Set(['starter', 'pro', 'builder', 'embedded']);

export function toWholeNumber(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function toMoneyNumber(value, fallback = 0) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function normalizeWeeklyPlan(data = {}) {
  return {
    outreachGoal: toWholeNumber(data.outreachGoal, DEFAULT_WEEKLY_PLAN.outreachGoal),
    replyGoal: toWholeNumber(data.replyGoal, DEFAULT_WEEKLY_PLAN.replyGoal),
    closeGoal: toWholeNumber(data.closeGoal, DEFAULT_WEEKLY_PLAN.closeGoal),
    depositGoal: toWholeNumber(data.depositGoal, DEFAULT_WEEKLY_PLAN.depositGoal),
    depositCount: toWholeNumber(data.depositCount, DEFAULT_WEEKLY_PLAN.depositCount),
    weeklyCashCollected: toMoneyNumber(data.weeklyCashCollected, DEFAULT_WEEKLY_PLAN.weeklyCashCollected),
    productMove: String(data.productMove || '').trim(),
    revenueMove: String(data.revenueMove || '').trim(),
    systemMove: String(data.systemMove || '').trim(),
    blocker: String(data.blocker || '').trim(),
  };
}

export function normalizeUsageTierRecord(data = {}, id = '') {
  if (!data || typeof data !== 'object') {
    return null;
  }

  const plan = String(data.plan || '').trim().toLowerCase();
  const tier = String(data.tier || '').trim().toLowerCase();
  const alias = String(data.alias || '').trim().toLowerCase();
  const pub = String(data.pub || '').trim();
  const updatedAt = Number(data.updatedAt || 0);
  const recordId = String(id || '').trim();

  if (!recordId && !alias && !pub) {
    return null;
  }

  return {
    id: recordId,
    alias,
    pub,
    plan,
    tier,
    updatedAt: Number.isFinite(updatedAt) ? updatedAt : 0,
  };
}

export function summarizeLinkedBilling(records = {}) {
  const canonical = new Map();

  Object.entries(records || {}).forEach(([id, raw]) => {
    const record = normalizeUsageTierRecord(raw, id);
    if (!record) {
      return;
    }

    const identityKey = record.alias || record.pub || record.id;
    if (!identityKey) {
      return;
    }

    const existing = canonical.get(identityKey);
    if (!existing || record.updatedAt >= existing.updatedAt) {
      canonical.set(identityKey, record);
    }
  });

  const deduped = Array.from(canonical.values());
  const linkedPaidCustomers = deduped.filter(record => PAID_PLAN_SET.has(record.plan)).length;
  const builderCustomers = deduped.filter(record => record.plan === 'builder').length;
  const embeddedCustomers = deduped.filter(record => record.plan === 'embedded').length;

  return {
    linkedAccounts: deduped.length,
    linkedPaidCustomers,
    builderCustomers,
    embeddedCustomers,
  };
}

export function normalizeStripeMetricsRecord(data = {}) {
  const normalizeCurrencyTotals = (value) => {
    if (!value || typeof value !== 'object') {
      return {};
    }

    return Object.entries(value).reduce((acc, [currency, amount]) => {
      const normalizedCurrency = String(currency || '').trim().toUpperCase();
      const numeric = Number.parseFloat(String(amount));
      if (normalizedCurrency && Number.isFinite(numeric)) {
        acc[normalizedCurrency] = numeric;
      }
      return acc;
    }, {});
  };

  if (!data || typeof data !== 'object') {
    return {
      activeSubscribers: 0,
      recurringRevenue: {},
      updatedAt: '',
    };
  }

  return {
    activeSubscribers: toWholeNumber(data.activeSubscribers, 0),
    recurringRevenue: normalizeCurrencyTotals(data.recurringRevenue),
    updatedAt: String(data.updatedAt || '').trim(),
  };
}

export function estimateRecurringRevenue({ builderCustomers = 0, embeddedCustomers = 0 } = {}) {
  return (toWholeNumber(builderCustomers, 0) * 50) + (toWholeNumber(embeddedCustomers, 0) * 200);
}

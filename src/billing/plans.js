export const BILLING_ACTIVE_STATUSES = ['trialing', 'active', 'past_due', 'unpaid', 'paused'];

export const BILLING_PLANS = {
  starter: {
    plan: 'starter',
    usageTier: 'supporter',
    label: 'Family & Friends',
    shortLabel: '$5 supporter',
    amountLabel: '$5 / month',
    kind: 'subscription',
    envKeys: ['STRIPE_PRICE_STARTER_ID', 'STRIPE_PRICE_SUPPORTER_ID', 'STRIPE_PRICE_ID']
  },
  pro: {
    plan: 'pro',
    usageTier: 'pro',
    label: 'Founder Plan',
    shortLabel: '$20 pro',
    amountLabel: '$20 / month',
    kind: 'subscription',
    envKeys: ['STRIPE_PRICE_PRO_ID', 'STRIPE_PRICE_FOUNDER_ID']
  },
  builder: {
    plan: 'builder',
    usageTier: 'builder',
    label: 'Builder Plan',
    shortLabel: '$50 builder',
    amountLabel: '$50 / month',
    kind: 'subscription',
    envKeys: ['STRIPE_PRICE_BUILDER_ID', 'STRIPE_PRICE_STUDIO_ID']
  },
  embedded: {
    plan: 'embedded',
    usageTier: 'embedded',
    label: 'Embedded Plan',
    shortLabel: '$200 embedded',
    amountLabel: '$200 / month',
    kind: 'subscription',
    envKeys: ['STRIPE_PRICE_EMBEDDED_ID', 'STRIPE_PRICE_EXECUTION_ID', 'STRIPE_PRICE_200_ID']
  },
  custom: {
    plan: 'custom',
    usageTier: 'account',
    label: 'Custom Project',
    shortLabel: 'Custom one-time',
    amountLabel: 'Quoted one-time',
    kind: 'payment',
    envKeys: []
  }
};

const PLAN_ALIASES = {
  starter: 'starter',
  supporter: 'starter',
  family: 'starter',
  familyfriends: 'starter',
  'family-friends': 'starter',
  'family_and_friends': 'starter',
  '5': 'starter',
  pro: 'pro',
  founder: 'pro',
  '20': 'pro',
  builder: 'builder',
  studio: 'builder',
  partner: 'builder',
  '50': 'builder',
  embedded: 'embedded',
  execution: 'embedded',
  '200': 'embedded',
  custom: 'custom',
  one_time: 'custom',
  'one-time': 'custom',
  quoted: 'custom'
};

const PLAN_WEIGHTS = {
  free: 0,
  starter: 1,
  pro: 2,
  builder: 3,
  embedded: 4
};

const BILLING_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeBillingPlan(value = '') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-');

  if (!normalized) {
    return '';
  }

  return PLAN_ALIASES[normalized] || '';
}

export function getBillingPlan(value = '') {
  const plan = normalizeBillingPlan(value);
  return plan ? BILLING_PLANS[plan] || null : null;
}

export function planWeight(value = '') {
  const plan = normalizeBillingPlan(value) || String(value || '').trim().toLowerCase();
  return PLAN_WEIGHTS[plan] || 0;
}

export function usageTierFromPlan(value = '') {
  const plan = normalizeBillingPlan(value);
  if (!plan) {
    return 'account';
  }

  return BILLING_PLANS[plan]?.usageTier || 'account';
}

export function resolveConfiguredPriceId(planValue, config = process.env) {
  const plan = getBillingPlan(planValue);
  if (!plan) {
    return '';
  }

  for (const key of plan.envKeys) {
    const candidate = String(config?.[key] || '').trim();
    if (candidate) {
      return candidate;
    }
  }

  return '';
}

function appendNormalizedBillingEmail(output, seen, value) {
  if (Array.isArray(value)) {
    for (const item of value) {
      appendNormalizedBillingEmail(output, seen, item);
    }
    return;
  }

  const normalized = normalizeBillingEmail(value);
  if (!normalized || seen.has(normalized)) {
    return;
  }

  seen.add(normalized);
  output.push(normalized);
}

export function normalizeBillingEmailList(...values) {
  const output = [];
  const seen = new Set();

  for (const value of values) {
    appendNormalizedBillingEmail(output, seen, value);
  }

  return output;
}

export function normalizeBillingEmail(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized || !BILLING_EMAIL_PATTERN.test(normalized)) {
    return '';
  }

  return normalized;
}

export function isValidBillingEmail(value = '') {
  return Boolean(normalizeBillingEmail(value));
}

export function normalizeCustomAmount(value) {
  if (value === null || value === undefined || value === '') {
    return 0;
  }

  const numeric = typeof value === 'number'
    ? value
    : Number(String(value).replace(/[^0-9.]/g, ''));

  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 0;
  }

  return Math.round(numeric * 100);
}

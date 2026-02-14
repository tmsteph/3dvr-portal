import crypto from 'node:crypto';

const DEFAULT_PLAN_LIMITS = {
  free: { minute: 1, day: 1 },
  starter: { minute: 2, day: 10 },
  pro: { minute: 6, day: 80 },
  admin: { minute: 9999, day: 9999 }
};

function toBase64Url(value) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fromBase64Url(value) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return Buffer.from(padded, 'base64').toString('utf8');
}

function signPayload(payloadPart, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(payloadPart)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  if (left.length !== right.length) {
    return false;
  }
  return crypto.timingSafeEqual(left, right);
}

export function normalizeEmail(value = '') {
  return String(value || '').trim().toLowerCase();
}

export function hashSubjectFromEmail(email = '') {
  return crypto
    .createHash('sha256')
    .update(normalizeEmail(email))
    .digest('hex');
}

export function parsePlanLimits(value, fallback = DEFAULT_PLAN_LIMITS) {
  if (!value) {
    return fallback;
  }

  if (typeof value === 'object' && value !== null) {
    return value;
  }

  try {
    const parsed = JSON.parse(String(value));
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
  } catch (error) {
    return fallback;
  }

  return fallback;
}

export function resolvePlanLimit(plan = 'free', limits = DEFAULT_PLAN_LIMITS) {
  const normalizedPlan = String(plan || '').toLowerCase();
  return limits[normalizedPlan] || limits.free || DEFAULT_PLAN_LIMITS.free;
}

export function issueUserToken({
  email,
  plan = 'free',
  secret,
  ttlSeconds = 60 * 60 * 24 * 7,
  now = Date.now()
} = {}) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !secret) {
    throw new Error('email and secret are required to issue a user token.');
  }

  const issuedAt = Math.floor(now / 1000);
  const expiresAt = issuedAt + Math.max(60, Number(ttlSeconds) || 0);

  const payload = {
    sub: hashSubjectFromEmail(normalizedEmail),
    email: normalizedEmail,
    plan: String(plan || 'free').toLowerCase(),
    iat: issuedAt,
    exp: expiresAt,
    scope: 'money-loop'
  };

  const payloadPart = toBase64Url(JSON.stringify(payload));
  const signature = signPayload(payloadPart, secret);
  return {
    token: `${payloadPart}.${signature}`,
    payload
  };
}

export function verifyUserToken(token, secret, now = Date.now()) {
  if (!token || !secret) {
    return { valid: false, reason: 'missing token or secret' };
  }

  const parts = String(token).split('.');
  if (parts.length !== 2) {
    return { valid: false, reason: 'malformed token' };
  }

  const [payloadPart, signaturePart] = parts;
  const expectedSignature = signPayload(payloadPart, secret);
  if (!safeEqual(signaturePart, expectedSignature)) {
    return { valid: false, reason: 'invalid signature' };
  }

  let payload;
  try {
    payload = JSON.parse(fromBase64Url(payloadPart));
  } catch (error) {
    return { valid: false, reason: 'invalid payload' };
  }

  const epoch = Math.floor(now / 1000);
  if (!payload.exp || payload.exp < epoch) {
    return { valid: false, reason: 'token expired' };
  }

  return { valid: true, payload };
}

function minuteWindowStart(now = Date.now()) {
  return Math.floor(now / 60000) * 60000;
}

function dayWindowStartUtc(now = Date.now()) {
  const date = new Date(now);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function isoFromMs(ms) {
  return new Date(ms).toISOString();
}

export function createInMemoryRateLimiter() {
  const minuteMap = new Map();
  const dayMap = new Map();

  function consume(map, key, limit, resetAtMs) {
    const existing = map.get(key);
    const nextCount = (existing?.count || 0) + 1;
    if (nextCount > limit) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: isoFromMs(existing?.resetAt || resetAtMs)
      };
    }

    map.set(key, {
      count: nextCount,
      resetAt: resetAtMs
    });

    return {
      allowed: true,
      remaining: Math.max(0, limit - nextCount),
      resetAt: isoFromMs(resetAtMs)
    };
  }

  return {
    consume({ subject, plan, limits = DEFAULT_PLAN_LIMITS, now = Date.now() }) {
      const planLimit = resolvePlanLimit(plan, limits);
      const minuteLimit = Math.max(1, Number(planLimit.minute) || 1);
      const dayLimit = Math.max(1, Number(planLimit.day) || 1);

      const minuteStart = minuteWindowStart(now);
      const minuteReset = minuteStart + 60000;
      const dayStart = dayWindowStartUtc(now);
      const dayReset = dayStart + 24 * 60 * 60 * 1000;

      const minuteKey = `${subject}:m:${minuteStart}`;
      const dayKey = `${subject}:d:${dayStart}`;

      const minuteResult = consume(minuteMap, minuteKey, minuteLimit, minuteReset);
      if (!minuteResult.allowed) {
        return {
          allowed: false,
          scope: 'minute',
          limits: { minute: minuteLimit, day: dayLimit },
          minute: minuteResult,
          day: {
            remaining: Math.max(0, dayLimit - (dayMap.get(dayKey)?.count || 0)),
            resetAt: isoFromMs(dayReset)
          }
        };
      }

      const dayResult = consume(dayMap, dayKey, dayLimit, dayReset);
      if (!dayResult.allowed) {
        return {
          allowed: false,
          scope: 'day',
          limits: { minute: minuteLimit, day: dayLimit },
          minute: minuteResult,
          day: dayResult
        };
      }

      return {
        allowed: true,
        scope: 'ok',
        limits: { minute: minuteLimit, day: dayLimit },
        minute: minuteResult,
        day: dayResult
      };
    }
  };
}

export function resolvePlanFromSubscription(subscription, pricePlanMap = {}) {
  const item = subscription?.items?.data?.[0];
  const metadataPlan = String(item?.price?.metadata?.plan || '').trim().toLowerCase();
  if (metadataPlan) {
    return metadataPlan;
  }

  const priceId = String(item?.price?.id || '').trim();
  if (priceId && pricePlanMap[priceId]) {
    return String(pricePlanMap[priceId]).trim().toLowerCase();
  }

  const nicknamePlan = String(item?.price?.nickname || '').trim().toLowerCase();
  if (nicknamePlan.includes('pro')) {
    return 'pro';
  }
  if (nicknamePlan.includes('starter')) {
    return 'starter';
  }

  return 'starter';
}

export function parsePricePlanMap(value) {
  if (!value) {
    return {};
  }

  if (typeof value === 'object' && value !== null) {
    return value;
  }

  try {
    const parsed = JSON.parse(String(value));
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
  } catch (error) {
    return {};
  }

  return {};
}

export const DEFAULT_RATE_LIMITS = DEFAULT_PLAN_LIMITS;

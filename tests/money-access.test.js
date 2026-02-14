import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_RATE_LIMITS,
  createInMemoryRateLimiter,
  issueUserToken,
  parsePlanLimits,
  parsePricePlanMap,
  resolvePlanFromSubscription,
  verifyUserToken
} from '../src/money/access.js';

test('issueUserToken and verifyUserToken roundtrip', () => {
  const now = Date.UTC(2026, 1, 13, 0, 0, 0);
  const issued = issueUserToken({
    email: 'User@example.com',
    plan: 'starter',
    secret: 'token-secret',
    ttlSeconds: 3600,
    now
  });

  const verified = verifyUserToken(issued.token, 'token-secret', now + 1000);
  assert.equal(verified.valid, true);
  assert.equal(verified.payload.email, 'user@example.com');
  assert.equal(verified.payload.plan, 'starter');
});

test('verifyUserToken rejects invalid signature and expiry', () => {
  const now = Date.UTC(2026, 1, 13, 0, 0, 0);
  const issued = issueUserToken({
    email: 'user@example.com',
    plan: 'free',
    secret: 'token-secret',
    ttlSeconds: 5,
    now
  });

  const bad = verifyUserToken(`${issued.token}x`, 'token-secret', now);
  assert.equal(bad.valid, false);

  const expired = verifyUserToken(issued.token, 'token-secret', now + 70_000);
  assert.equal(expired.valid, false);
});

test('createInMemoryRateLimiter enforces minute and day caps', () => {
  const limiter = createInMemoryRateLimiter();
  const limits = {
    ...DEFAULT_RATE_LIMITS,
    starter: { minute: 2, day: 3 }
  };

  const first = limiter.consume({ subject: 'user-1', plan: 'starter', limits, now: Date.UTC(2026, 1, 13, 10, 0, 1) });
  assert.equal(first.allowed, true);

  const second = limiter.consume({ subject: 'user-1', plan: 'starter', limits, now: Date.UTC(2026, 1, 13, 10, 0, 2) });
  assert.equal(second.allowed, true);

  const thirdMinute = limiter.consume({ subject: 'user-1', plan: 'starter', limits, now: Date.UTC(2026, 1, 13, 10, 0, 3) });
  assert.equal(thirdMinute.allowed, false);
  assert.equal(thirdMinute.scope, 'minute');

  const afterMinuteReset = limiter.consume({ subject: 'user-1', plan: 'starter', limits, now: Date.UTC(2026, 1, 13, 10, 1, 1) });
  assert.equal(afterMinuteReset.allowed, true);

  const dayExceeded = limiter.consume({ subject: 'user-1', plan: 'starter', limits, now: Date.UTC(2026, 1, 13, 10, 2, 1) });
  assert.equal(dayExceeded.allowed, false);
  assert.equal(dayExceeded.scope, 'day');
});

test('resolvePlanFromSubscription supports metadata and mapped price ids', () => {
  const metadataPlan = resolvePlanFromSubscription({
    items: {
      data: [
        {
          price: {
            metadata: { plan: 'pro' }
          }
        }
      ]
    }
  }, {});
  assert.equal(metadataPlan, 'pro');

  const mappedPlan = resolvePlanFromSubscription({
    items: {
      data: [
        {
          price: {
            id: 'price_123',
            metadata: {}
          }
        }
      ]
    }
  }, { price_123: 'starter' });
  assert.equal(mappedPlan, 'starter');
});

test('parse helpers return sane fallbacks', () => {
  const parsedLimits = parsePlanLimits('{"pro":{"minute":9,"day":99}}');
  assert.equal(parsedLimits.pro.minute, 9);

  const parsedMap = parsePricePlanMap('{"price_abc":"pro"}');
  assert.equal(parsedMap.price_abc, 'pro');
});

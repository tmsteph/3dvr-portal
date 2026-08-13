import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const payPage = readFileSync(new URL('../pay/index.html', import.meta.url), 'utf8');
const router = readFileSync(new URL('../start/router.js', import.meta.url), 'utf8');

const links = {
  starter: 'https://buy.stripe.com/5kQ9AT5XEg4z38HcMAc7u0c',
  pro: 'https://buy.stripe.com/aFafZhadUg4zbFdh2Qc7u0d',
  builder: 'https://buy.stripe.com/4gM14n4TAdWr8t17sgc7u0e',
  embedded: 'https://buy.stripe.com/dRm28radUg4zaB9fYMc7u0f',
};

test('public pay page exposes all four live Stripe subscription links', () => {
  for (const [plan, url] of Object.entries(links)) {
    assert.match(payPage, new RegExp(`data-plan="${plan}"`));
    assert.ok(payPage.includes(url));
  }
  assert.match(payPage, /No portal account first/);
});

test('start router sends paid recommendations to account-free pay page', () => {
  assert.match(router, /`\.\.\/pay\/\?plan=\$\{encodeURIComponent\(normalizedPlan\)\}`/);
  assert.match(router, /No portal account required before payment/);
  assert.match(router, /initPaidLanes/);
  assert.doesNotMatch(router, /Portal account first, then Stripe/);
});

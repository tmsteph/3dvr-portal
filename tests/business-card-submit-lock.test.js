import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const checkoutPage = readFileSync(new URL('../cards/index.html', import.meta.url), 'utf8');

test('business card checkout stays locked while a submit is in flight', () => {
  assert.match(checkoutPage, /submitting=false/);
  assert.match(checkoutPage, /function setSubmitting\(value\)/);
  assert.match(checkoutPage, /if\(submitting\)return/);
  assert.match(checkoutPage, /products\.querySelectorAll\('input\[name="product"\]'\).*input\.disabled=value/);
  assert.match(checkoutPage, /pay\.disabled=submitting/);
});

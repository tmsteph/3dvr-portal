import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('sales buyer journey page keeps the internal funnel visible', async () => {
  const salesHubHtml = await readFile(new URL('../sales/index.html', import.meta.url), 'utf8');
  const html = await readFile(new URL('../sales/buyer-journey.html', import.meta.url), 'utf8');

  assert.match(salesHubHtml, /Buyer journey infographic/);
  assert.match(salesHubHtml, /Open Buyer Journey/);
  assert.match(html, /Five stages/);
  assert.match(html, /Buyer Journey Infographic/);
  assert.match(html, /lead capture, qualification, checkout, onboarding, and delivery/);
  assert.match(html, /Lead Capture/);
  assert.match(html, /CRM/);
  assert.match(html, /Billing/);
  assert.match(html, /Onboard \+ Deliver/);
  assert.match(html, /Start \+ Projects/);
  assert.match(html, /Open Start Here/);
  assert.match(html, /Open Lead Capture/);
});

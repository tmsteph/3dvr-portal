import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('Website Upgrade page makes the paid scope and automatic fulfillment concrete', async () => {
  const html = await readFile(new URL('../business-sites/index.html', import.meta.url), 'utf8');
  assert.match(html, /Buy the \$99 upgrade/);
  assert.match(html, /one mobile-first page with a clearer offer/);
  assert.match(html, /verified Stripe event routes the paid order into the agent-first fulfillment queue automatically/);
  assert.match(html, /fulfillment starts only from a verified paid event/);
  assert.match(html, /No promise of guaranteed leads/);
  assert.match(html, /https:\/\/buy\.stripe\.com\/aFa6oH85M4lRfVtcMAc7u0j/);
});

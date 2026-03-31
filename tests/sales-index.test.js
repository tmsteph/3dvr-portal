import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('sales index leads with the revenue close section', async () => {
  const html = await readFile(new URL('../sales/index.html', import.meta.url), 'utf8');

  assert.match(html, /Pick one lead, one offer, and one ask\. Keep the close path simple\./);
  assert.match(html, /<p class="text-xs uppercase tracking-\[0\.3em\] text-blue-300">Today&apos;s close<\/p>/);
  assert.match(html, /\$50 \/ month/);
  assert.match(html, /\$200 \/ month/);
  assert.match(html, /Ask Builder/);
  assert.match(html, /Ask Embedded/);
  assert.match(html, /Open billing/);
  assert.match(html, /Sales Training/);
  assert.match(html, /Profitability Desk/);
  assert.match(html, /Open profitability desk/);

  assert.ok(
    html.indexOf('Today&apos;s close') < html.indexOf('Sales Guidance'),
    'expected the revenue close section to appear before the guidance section'
  );
});

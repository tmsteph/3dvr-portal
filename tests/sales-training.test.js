import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('sales training leads with the outreach method', async () => {
  const salesHubHtml = await readFile(new URL('../sales/index.html', import.meta.url), 'utf8');
  const html = await readFile(new URL('../sales/training/index.html', import.meta.url), 'utf8');

  assert.match(salesHubHtml, /Work the reach-out method, sharpen the pitch, and rehearse follow-up flows in one workspace\./);
  assert.match(html, /Reach-Out Training/);
  assert.match(html, /Reach-Out Method/);
  assert.match(html, /The 5-step loop/);
  assert.match(html, /Today’s outreach plan/);
  assert.match(html, /Done for the day/);
  assert.match(html, /Lead Capture/);
  assert.match(html, /CRM dashboard/);
});

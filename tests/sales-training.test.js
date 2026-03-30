import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('sales training leads with the outreach method and shared queue', async () => {
  const salesHubHtml = await readFile(new URL('../sales/index.html', import.meta.url), 'utf8');
  const html = await readFile(new URL('../sales/training/index.html', import.meta.url), 'utf8');

  assert.match(salesHubHtml, /Start the reach-out desk, sharpen the pitch, and keep follow-up moving in one workspace\./);
  assert.match(html, /Reach-Out Desk/);
  assert.match(html, /One lead\. One message\. One follow-up\./);
  assert.match(html, /https:\/\/cdn\.jsdelivr\.net\/npm\/gun\/gun\.js/);
  assert.match(html, /\/gun-init\.js/);
  assert.match(html, /Reach-Out Method/);
  assert.match(html, /The method/);
  assert.match(html, /Today's queue/);
  assert.match(html, /Shared with Gun/);
  assert.match(html, /today-queue/);
  assert.match(html, /Outreach queue/);
  assert.match(html, /Done for the day/);
  assert.match(html, /Lead Capture/);
  assert.match(html, /CRM dashboard/);
  assert.match(html, /Follow-Up Loop/);
  assert.match(html, /Pipeline Hygiene/);
});

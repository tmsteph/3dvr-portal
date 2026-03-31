import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('sales training keeps the active step in the center workspace', async () => {
  const salesHubHtml = await readFile(new URL('../sales/index.html', import.meta.url), 'utf8');
  const html = await readFile(new URL('../sales/training/index.html', import.meta.url), 'utf8');

  assert.match(salesHubHtml, /Start the reach-out desk, sharpen the pitch, and keep follow-up moving in one workspace\./);
  assert.match(html, /<section class="workspace-shell">/);
  assert.match(html, /<article class="card workspace-intro">/);
  assert.match(html, /<div class="workspace-kicker">Current step<\/div>/);
  assert.match(html, /Reach-Out Desk/);
  assert.match(html, /One lead\. One message\. One follow-up\./);
  assert.match(html, /https:\/\/cdn\.jsdelivr\.net\/npm\/gun\/gun\.js/);
  assert.match(html, /\/gun-init\.js/);
  assert.match(html, /Shared with Gun/);
  assert.match(html, /Today's queue/);
  assert.match(html, /today-queue/);
  assert.match(html, /data-queue-sync-status/);
  assert.match(html, /Queue sync failed\. Local copy kept on this device\./);
  assert.match(html, /Shared with Gun\. Last synced/);
  assert.match(html, /itemsJson: serializeQueueForGun\(getReachoutQueue\(\)\)/);
  assert.match(html, /const rawJson = typeof data\.itemsJson === 'string' \? data\.itemsJson\.trim\(\) : ''/);
  assert.match(html, /Lead Capture/);
  assert.match(html, /CRM dashboard/);
  assert.match(html, /Follow-Up Loop/);
  assert.match(html, /Pipeline Hygiene/);

  assert.ok(
    html.indexOf('id="content"') < html.indexOf('id="overview"'),
    'expected the content panel to appear before the overview rail'
  );
});

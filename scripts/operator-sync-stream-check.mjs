import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.OPERATOR_SYNC_CHECK_URL || 'http://127.0.0.1:4320';
const browser = process.env.OPERATOR_SYNC_CHECK_CDP
  ? await chromium.connectOverCDP(process.env.OPERATOR_SYNC_CHECK_CDP)
  : await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
try {
  await page.route('**/operator/sync.js', route => route.fulfill({
    contentType: 'text/javascript',
    body: `export { mergeOperatorStores } from './sync.js?original=1';
      export function createOperatorSync() { return {
        ready: Promise.resolve(true), isReady: () => true, save: async () => true,
        load: async store => { await new Promise(resolve => setTimeout(resolve, 2000));
          window.__syncArrived = true; return structuredClone(store); }
      }; }`
  }));
  await page.route('**/api/openai-site?provider=operator', async route => {
    await new Promise(resolve => setTimeout(resolve, 3000));
    await route.fulfill({ contentType: 'text/event-stream', body:
      'event: reply_delta\ndata: {"delta":"Sync race reply retained."}\n\n' +
      'event: result\ndata: {"reply":"Sync race reply retained.","action":{"type":"none"}}\n\n' });
  });
  await page.goto(`${base}/operator/`, { waitUntil: 'domcontentloaded' });
  await page.locator('.operator-attach').waitFor();
  await page.locator('#operator-input').fill('Read-only sync race check.');
  await page.locator('#operator-form button[type=submit]').click();
  await page.waitForFunction(() => window.__syncArrived === true);
  const reply = page.locator('#operator-log .message.assistant .message-content').getByText('Sync race reply retained.', { exact: true });
  await reply.waitFor({ timeout: 10000 });
  await page.waitForFunction(() => !document.querySelector('#operator-form button[type=submit]').disabled);
  await page.waitForTimeout(300);
  assert.equal(await reply.isVisible(), true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await reply.waitFor({ timeout: 10000 });
  console.log('OPERATOR_SYNC_STREAM_RELOAD_PASS');
} finally {
  await context.close();
  await browser.close();
}

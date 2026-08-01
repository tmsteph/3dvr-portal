import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

let browser;
let server;
const TEST_ORIGIN = 'http://127.0.0.1:4317';

async function waitForServer() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`${TEST_ORIGIN}/money-printer/`);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Opportunity Inbox test server did not start.');
}

before(async () => {
  server = spawn(process.execPath, ['scripts/dev-server.mjs'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, PORT: '4317', HOST: '127.0.0.1' },
    stdio: 'ignore'
  });
  await waitForServer();
  browser = await chromium.launch({ headless: true });
});

after(async () => {
  await browser?.close();
  server?.kill('SIGTERM');
});

describe('Money Printer Opportunity Inbox', () => {
  it('captures evidence, persists it, and routes a response to human review without sending', async () => {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
    await page.goto(`${TEST_ORIGIN}/money-printer/`, { waitUntil: 'networkidle' });

    await page.locator('[name="need"]').fill('200 business cards tomorrow morning');
    await page.locator('[name="buyerWords"]').fill('I need 200 business cards delivered before 8 AM tomorrow.');
    await page.locator('[name="location"]').fill('San Diego');
    await page.locator('[name="urgency"]').selectOption('immediate');
    await page.locator('[name="estimatedValueMin"]').fill('250');
    await page.locator('[name="estimatedCostMax"]').fill('140');
    await page.locator('[name="suggestedResponse"]').fill('I can confirm the artwork and arrange delivery by 8 AM.');
    await page.locator('[name="nextAction"]').fill('Confirm artwork and collect deposit');
    await page.getByRole('button', { name: 'Add to Opportunity Inbox' }).click();

    const card = page.locator('.opportunity-card');
    await card.waitFor();
    assert.match(await card.textContent(), /200 business cards tomorrow morning/);
    assert.match(await card.textContent(), /San Diego/);
    assert.match(await card.textContent(), /manual-forward/);
    assert.match(await card.textContent(), /review-required/);
    assert.match(await card.textContent(), /Confirm artwork and collect deposit/);

    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await page.locator('.opportunity-card').count(), 1);

    await page.getByRole('button', { name: 'Review response' }).click();
    const reviewCard = page.locator('.message-review-card').filter({ hasText: '200 business cards tomorrow morning' });
    await reviewCard.waitFor();
    assert.match(await reviewCard.textContent(), /human review is required before sending/i);
    assert.match(await reviewCard.textContent(), /Approve draft/);
    assert.match(await page.locator('#missionStatus').textContent(), /Nothing was sent/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);

    await page.screenshot({ path: '/tmp/opportunity-inbox-mobile.png', fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.locator('#opportunityInboxTitle').scrollIntoViewIfNeeded();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.screenshot({ path: '/tmp/opportunity-inbox-desktop.png', fullPage: false });
    await page.close();
  });
});

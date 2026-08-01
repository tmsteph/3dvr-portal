import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium } from 'playwright';

const PORTAL_ORIGIN = process.env.PORTAL_ORIGIN || 'http://127.0.0.1:3011';

test('operator completes core user journeys on mobile', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.route('**/api/openai-site?provider=operator', async route => {
    const request = route.request().postDataJSON();
    const isLead = /Acme Electric/i.test(request.prompt);
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(isLead ? {
        reply: 'I added the business to your pipeline.',
        action: { type: 'add_lead', title: '', text: 'Needs a better website.', business: 'Acme Electric', location: 'San Diego, CA', url: '' }
      } : {
        reply: 'I saved that so you do not have to organize it now.',
        action: { type: 'create_note', title: 'Family camping trip', text: 'Plan a family camping trip in October.', business: '', location: '', url: '' }
      })
    });
  });

  await page.goto(`${PORTAL_ORIGIN}/operator/`);
  await page.getByLabel('Message your operator').fill('Remember that I want to plan a family camping trip in October.');
  await page.getByRole('button', { name: /Do it/ }).click();
  await page.getByText('Saved in Life Space.').waitFor();
  assert.equal(await page.getByRole('link', { name: /Open Life Space/ }).getAttribute('href'), '/life-space/');

  await page.getByLabel('Message your operator').fill('Add Acme Electric in San Diego to my leads.');
  await page.getByLabel('Message your operator').press('Control+Enter');
  await page.getByText('Added Acme Electric to Lead Finder.').waitFor();
  const leads = await page.evaluate(() => JSON.parse(localStorage.getItem('3dvr.leadFinder.prospects.v1') || '[]'));
  assert.equal(leads[0].business, 'Acme Electric');

  const dimensions = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: innerWidth }));
  assert.ok(dimensions.width <= dimensions.viewport, `horizontal overflow: ${dimensions.width} > ${dimensions.viewport}`);

  await page.reload();
  await page.getByText('Added Acme Electric to Lead Finder.').waitFor();
  await page.getByRole('button', { name: 'New conversation' }).click();
  assert.equal(await page.locator('.message').count(), 0);
  await browser.close();
});
